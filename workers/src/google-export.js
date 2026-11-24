import { answerFields, readSchema, schemaRounds } from './forms.js';

const DRIVE = 'https://www.googleapis.com/drive/v3/files';
const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';
const MIME = 'application/vnd.google-apps.spreadsheet';

export function exportConfigured(env) {
  return !!(env.GOOGLE_EXPORT_FOLDER_ID && env.GOOGLE_CLIENT_ID
    && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_REFRESH_TOKEN);
}

class GoogleError extends Error {}

async function googleJson(fetcher, url, init) {
  const response = await fetcher(url, init);
  if (!response.ok) {
    // Do not store third-party response bodies, which can contain credentials or personal data.
    await response.body?.cancel();
    throw new GoogleError('Google API vrátilo HTTP ' + response.status + '.');
  }
  return response.json();
}

async function accessToken(env, fetcher) {
  const request = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    refresh_token: env.GOOGLE_REFRESH_TOKEN,
    grant_type: 'refresh_token'
  });
  const result = await googleJson(fetcher, 'https://oauth2.googleapis.com/token', { method: 'POST', body: request });
  if (!result.access_token) throw new GoogleError('Google nepotvrdil přístup k exportu.');
  return result.access_token;
}

async function findOrCreateSheet(api, folder, formId, title) {
  if (!/^[A-Za-z0-9_-]+$/.test(folder) || !/^[A-Za-z0-9_-]+$/.test(formId)) {
    throw new GoogleError('Neplatná cílová složka nebo ID formuláře.');
  }
  const query = new URLSearchParams({
    q: `'${folder}' in parents and trashed = false and mimeType = '${MIME}' and appProperties has { key='colectorV2FormId' and value='${formId}' }`,
    fields: 'files(id)',
    pageSize: '1',
    supportsAllDrives: 'true',
    includeItemsFromAllDrives: 'true'
  });
  const existing = await api(DRIVE + '?' + query);
  if (existing.files?.length) return existing.files[0].id;
  const created = await api(DRIVE + '?supportsAllDrives=true&fields=id', {
    name: 'CoLector — ' + title,
    mimeType: MIME,
    parents: [folder],
    appProperties: { colectorV2FormId: formId }
  });
  return created.id;
}

function formatAnswer(field, value) {
  if (field.type === 'yes_no') return value === 'yes' ? 'Ano' : value === 'no' ? 'Ne' : '';
  if (field.type === 'checkbox') {
    const labels = new Map((field.options || []).map(option => [option.id || option.label, option.label]));
    return (Array.isArray(value) ? value : []).map(id => labels.get(id) || id).filter(Boolean).join(', ');
  }
  return String(value ?? '');
}

export function exportTable(schema, records) {
  const rounds = schemaRounds(schema);
  const columns = rounds.flatMap((part, index) => answerFields(part).map((field, i) => ({
    field, partId: part.id,
    label: (rounds.length > 1 ? 'Part ' + String.fromCharCode(65 + index) + ' · ' : '')
      + (field.label || 'Položka ' + (i + 1))
  })));
  const table = [['Tým', ...columns.map(column => column.label)]];
  for (const [number, answers] of Map.groupBy(records, row => row.number)) {
    const parts = new Map(answers.map(row => [row.part_id, readSchema(row.answers_json)]));
    table.push(['Tým ' + number, ...columns.map(({ field, partId }) => {
      const part = parts.get(partId);
      return formatAnswer(field, part && Object.hasOwn(part, field.id) ? part[field.id] : undefined);
    })]);
  }
  return table;
}

async function writeTable(api, spreadsheetId, table, job) {
  const endpoint = SHEETS + '/' + encodeURIComponent(spreadsheetId);
  const info = await api(endpoint + '?fields=sheets(properties(sheetId,title,gridProperties))');
  const sheets = info.sheets || [];
  const sheet = sheets.find(item => item.properties.title === 'ODPOVĚDI') || sheets[0];
  if (!sheet) throw new GoogleError('Google Sheet neobsahuje list pro odpovědi.');
  const { sheetId, gridProperties } = sheet.properties;
  const height = table.length;
  const width = table[0].length;
  await api(endpoint + ':batchUpdate', { requests: [
    { updateSheetProperties: {
      properties: { sheetId, title: 'ODPOVĚDI', gridProperties: {
        frozenRowCount: 1,
        rowCount: Math.max(gridProperties.rowCount, height, job.exported_rows),
        columnCount: Math.max(gridProperties.columnCount, width, job.exported_columns)
      } },
      fields: 'title,gridProperties(frozenRowCount,rowCount,columnCount)'
    } },
    { updateCells: {
      range: { sheetId, startRowIndex: 0, startColumnIndex: 0,
        endRowIndex: Math.max(height, job.exported_rows), endColumnIndex: Math.max(width, job.exported_columns) },
      rows: table.map(values => ({ values: values.map(value => ({ userEnteredValue: { stringValue: value } })) })),
      fields: 'userEnteredValue'
    } }
  ] });
}

const lockJob = `UPDATE sheet_exports SET lease_until = ?
  WHERE form_id = (SELECT form_id FROM sheet_exports WHERE requested_version > completed_version
    AND lease_until <= ? AND retry_after <= ? ORDER BY retry_after, form_id LIMIT 1)
  RETURNING *`;

export async function flushSheetExports(env, fetcher = fetch) {
  if (!exportConfigured(env)) return;
  const db = env.DB;
  let token;
  for (let i = 0; i < 3; i++) {
    const time = Date.now();
    const lease = time + 10 * 60_000;
    const job = await db.prepare(lockJob).bind(lease, time, time).first();
    if (!job) break;

    try {
      token ||= await accessToken(env, fetcher);
      const api = (url, data) => googleJson(fetcher, url, {
        method: data ? 'POST' : 'GET',
        headers: { Authorization: 'Bearer ' + token, ...(data ? { 'Content-Type': 'application/json' } : {}) },
        body: data ? JSON.stringify(data) : undefined
      });
      const [forms, rows] = await db.batch([
        db.prepare('SELECT published FROM forms WHERE id = ?').bind(job.form_id),
        db.prepare(`SELECT t.number, a.part_id, a.answers_json FROM answers a JOIN teams t
          ON t.form_id = a.form_id AND t.team_id = a.team_id WHERE a.form_id = ? ORDER BY t.number`).bind(job.form_id)
      ]);
      const schema = readSchema(forms.results[0].published);
      const spreadsheetId = job.spreadsheet_id || await findOrCreateSheet(api, env.GOOGLE_EXPORT_FOLDER_ID,
        job.form_id, schema.internalTitle || schema.title || 'Formulář');
      await db.prepare('UPDATE sheet_exports SET spreadsheet_id = ? WHERE form_id = ? AND lease_until = ?')
        .bind(spreadsheetId, job.form_id, lease).run();

      const table = exportTable(schema, rows.results);
      await writeTable(api, spreadsheetId, table, job);
      await db.batch([
        db.prepare(`UPDATE sheet_exports SET completed_version = ?, exported_rows = ?, exported_columns = ?,
          attempts = 0, retry_after = 0, lease_until = 0, last_error = NULL WHERE form_id = ? AND lease_until = ?`)
          .bind(job.requested_version, table.length, table[0].length, job.form_id, lease),
        db.prepare('UPDATE forms SET revision = revision + 1 WHERE id = ? AND changes() > 0').bind(job.form_id)
      ]);
    } catch (error) {
      const retryAt = Date.now() + Math.min(60, 5 * 2 ** Math.min(job.attempts, 4)) * 60_000;
      const message = error instanceof GoogleError ? error.message : 'Export do Google Sheets se nepodařil.';
      await db.batch([
        db.prepare(`UPDATE sheet_exports SET attempts = attempts + 1, retry_after = ?, lease_until = 0,
          last_error = ? WHERE form_id = ? AND lease_until = ?`).bind(retryAt, message, job.form_id, lease),
        db.prepare('UPDATE forms SET revision = revision + 1 WHERE id = ? AND changes() > 0').bind(job.form_id)
      ]);
    }
  }
}
