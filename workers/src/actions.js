import {
  cleanAnswers, describeForm, isObject, readSchema, RequestError,
  requireId, roundStates, schemaRounds, sheetUrl, validateSchema
} from './forms.js';

const unavailable = () => new RequestError('Formulář není publikovaný.', 404);
const now = () => new Date().toISOString();

const formSql = 'SELECT * FROM forms WHERE id = ? AND deleted_at IS NULL';
const queueSql = `INSERT INTO sheet_exports (form_id)
  SELECT ? WHERE changes() > 0
  ON CONFLICT(form_id) DO UPDATE SET requested_version = requested_version + 1`;

function statement(db, sql, ...values) {
  return db.prepare(sql).bind(...values);
}

async function saveForm(db, payload, publish = false) {
  const formId = requireId(payload?.formId);
  validateSchema(payload.schema);
  const schema = JSON.stringify({ ...payload.schema, formId });
  const date = now();
  const save = statement(db, `INSERT INTO forms (id, draft, published, created_at, updated_at, published_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET draft = excluded.draft, updated_at = excluded.updated_at,
      published = COALESCE(excluded.published, forms.published),
      published_at = COALESCE(excluded.published_at, forms.published_at),
      revision = forms.revision + 1
    WHERE forms.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM teams WHERE form_id = forms.id)`,
  formId, schema, publish ? schema : null, date, date, publish ? date : null);
  const [result] = publish ? await db.batch([save, statement(db, queueSql, formId)]) : [await save.run()];
  if (!result.meta.changes) {
    throw new RequestError('Formulář už byl rozdán nebo smazán a nelze jej dále upravovat.', 409);
  }
  return { ok: true, formId, updatedAt: date, ...(publish ? { publishedAt: date } : {}) };
}

async function getFormDraft(db, id) {
  const form = await statement(db, `SELECT f.*, EXISTS(SELECT 1 FROM teams WHERE form_id = f.id) AS distributed
    FROM forms f WHERE id = ? AND deleted_at IS NULL`, requireId(id)).first();
  return form ? { ...describeForm(form), distributed: !!form.distributed, editable: !form.distributed } : null;
}

async function deleteForm(db, id) {
  const formId = requireId(id);
  const [update, data] = await db.batch([
    statement(db, 'UPDATE forms SET deleted_at = ?, revision = revision + 1 WHERE id = ? AND deleted_at IS NULL', now(), formId),
    statement(db, 'SELECT spreadsheet_id FROM sheet_exports WHERE form_id = ?', formId)
  ]);
  const url = sheetUrl(data.results[0]?.spreadsheet_id);
  return { ok: true, deleted: !!update.meta.changes, sessionDeleted: true, sheetPreserved: !!url, spreadsheetUrl: url };
}

async function duplicateForm(db, id) {
  const original = await getFormDraft(db, id);
  if (!original) throw new RequestError('Formulář nebyl nalezen.', 404);
  const formId = 'form_' + crypto.randomUUID();
  const internalTitle = (original.internalTitle || original.title || 'Nový formulář') + ' – kopie';
  await saveForm(db, { formId, schema: { ...original.schema, internalTitle } });
  return { ok: true, formId, internalTitle };
}

async function saveTemplate(db, payload) {
  const templateId = requireId(payload?.templateId);
  validateSchema(payload.schema);
  const { formId, ...schema } = payload.schema;
  const date = now();
  await statement(db, `INSERT INTO templates (id, schema_json, created_at, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET schema_json = excluded.schema_json, updated_at = excluded.updated_at`,
  templateId, JSON.stringify({ ...schema, templateId }), date, date).run();
  return { ok: true, templateId, updatedAt: date };
}

async function getTemplate(db, id) {
  const template = await statement(db, 'SELECT * FROM templates WHERE id = ?', requireId(id)).first();
  return template ? { templateId: id, schema: readSchema(template.schema_json), createdAt: template.created_at,
    updatedAt: template.updated_at } : null;
}

async function listTemplates(db) {
  const { results } = await db.prepare('SELECT * FROM templates ORDER BY updated_at DESC').all();
  return results.map(row => {
    const schema = readSchema(row.schema_json);
    return { templateId: row.id, internalTitle: schema.internalTitle || 'Nová šablona', title: schema.title || '',
      createdAt: row.created_at, updatedAt: row.updated_at, fieldCount: schema.fields?.length || 0 };
  });
}

async function templateCopy(db, id, asForm) {
  const template = await getTemplate(db, id);
  if (!template) throw new RequestError('Šablona nebyla nalezena.', 404);
  const { templateId, ...schema } = template.schema;
  if (asForm) {
    return saveForm(db, { formId: 'form_' + crypto.randomUUID(), schema });
  }
  return saveTemplate(db, { templateId: 'tpl_' + crypto.randomUUID(),
    schema: { ...schema, internalTitle: (schema.internalTitle || 'Šablona') + ' — kopie' } });
}

function partCounts(round, distributedCount, submittedCount) {
  return {
    roundId: round.id,
    number: round.number,
    unlocked: true,
    submittedCount: submittedCount || 0,
    distributedCount: Math.max(submittedCount || 0, distributedCount || 0)
  };
}

async function home(db) {
  const [forms, teams, opens, answers, complete] = await db.batch([
    db.prepare(`SELECT f.*, s.spreadsheet_id FROM forms f LEFT JOIN sheet_exports s ON s.form_id = f.id
      WHERE f.deleted_at IS NULL ORDER BY f.updated_at DESC`),
    db.prepare(`SELECT t.form_id, COUNT(*) count FROM teams t JOIN forms f ON f.id = t.form_id
      WHERE f.deleted_at IS NULL GROUP BY t.form_id`),
    db.prepare(`SELECT p.form_id, p.part_id, COUNT(*) count FROM part_opens p JOIN forms f ON f.id = p.form_id
      WHERE f.deleted_at IS NULL GROUP BY p.form_id, p.part_id`),
    db.prepare(`SELECT a.form_id, a.part_id, COUNT(*) count FROM answers a JOIN forms f ON f.id = a.form_id
      WHERE f.deleted_at IS NULL GROUP BY a.form_id, a.part_id`),
    db.prepare(`SELECT a.form_id, a.team_id, COUNT(*) count FROM answers a JOIN forms f ON f.id = a.form_id
      WHERE f.deleted_at IS NULL GROUP BY a.form_id, a.team_id`)
  ]);
  const key = (form, part) => form + ':' + part;
  const totals = new Map(teams.results.map(row => [row.form_id, row.count]));
  const distributed = new Map(opens.results.map(row => [key(row.form_id, row.part_id), row.count]));
  const submitted = new Map(answers.results.map(row => [key(row.form_id, row.part_id), row.count]));
  const finals = Map.groupBy(complete.results, row => row.form_id);
  return forms.results.map(form => {
    const { schema, publishedSchema, ...info } = describeForm(form);
    const rounds = schemaRounds(publishedSchema || schema);
    const total = totals.get(form.id) || 0;
    return {
      ...info,
      totalParticipants: total,
      distributedCount: total,
      collectedCount: (finals.get(form.id) || []).filter(row => row.count === rounds.length).length,
      dataUrl: sheetUrl(form.spreadsheet_id),
      rounds: rounds.map(round => partCounts(round, distributed.get(key(form.id, round.id)),
        submitted.get(key(form.id, round.id))))
    };
  });
}

function insertTeam(db, form, teamId, date) {
  return statement(db, `INSERT INTO teams (form_id, team_id, number, opened_at)
    SELECT id, ?, (SELECT COALESCE(MAX(number), 0) + 1 FROM teams WHERE form_id = forms.id), ?
    FROM forms WHERE id = ? AND published = ? AND deleted_at IS NULL
    ON CONFLICT(form_id, team_id) DO NOTHING`, teamId, date, form.id, form.published);
}

function teamLabel(number) {
  return 'Tým ' + number;
}

async function participant(db, input) {
  const formId = requireId(input?.formId);
  const teamId = requireId(input?.teamId);
  const form = await statement(db, formSql, formId).first();
  if (!form?.published) return { status: 'unavailable' };

  const rounds = schemaRounds(readSchema(form.published));
  const [created, teamData, completed] = await db.batch([
    insertTeam(db, form, teamId, now()),
    statement(db, 'SELECT number FROM teams WHERE form_id = ? AND team_id = ?', formId, teamId),
    statement(db, 'SELECT part_id FROM answers WHERE form_id = ? AND team_id = ?', formId, teamId)
  ]);
  const team = teamData.results[0];
  if (!team) return { status: 'unavailable' };
  const completedIds = new Set(completed.results.map(row => row.part_id));
  const completedRoundIds = rounds.filter(round => completedIds.has(round.id)).map(round => round.id);
  const next = rounds.find(round => !completedIds.has(round.id));
  const info = { teamLabel: teamLabel(team.number), completedRoundIds, roundCount: rounds.length, lockingEnabled: false };
  if (!next) return { status: 'complete', ...info };

  await db.batch([
    statement(db, `INSERT OR IGNORE INTO part_opens (form_id, team_id, part_id)
      SELECT id, ?, ? FROM forms WHERE id = ? AND published = ? AND deleted_at IS NULL`,
    teamId, next.id, formId, form.published),
    statement(db, 'UPDATE forms SET revision = revision + 1 WHERE id = ? AND (changes() > 0 OR ? > 0)',
      formId, created.meta.changes)
  ]);
  return { status: 'ready', ...info, roundId: next.id, roundNumber: next.number,
    schema: { version: 3, formId, roundId: next.id, roundNumber: next.number, title: next.title,
      instructions: next.instructions, fields: next.fields } };
}

async function submit(db, input) {
  const formId = requireId(input?.formId);
  const teamId = requireId(input?.teamId);
  const partId = requireId(input?.roundId);
  const responseId = requireId(input?.responseId);
  const form = await statement(db, formSql, formId).first();
  if (!form?.published) throw unavailable();

  const rounds = schemaRounds(readSchema(form.published));
  const part = rounds.find(round => round.id === partId);
  if (!part) throw new RequestError('Tento Part teď není aktivní.', 409);
  const values = cleanAnswers(part, input.answers);
  const priorParts = rounds.slice(0, part.number - 1).map(round => round.id);
  const [saved, , , data] = await db.batch([
    statement(db, `INSERT INTO answers (form_id, team_id, part_id, response_id, answers_json, submitted_at)
      SELECT f.id, t.team_id, ?, ?, ?, ? FROM forms f JOIN teams t ON t.form_id = f.id AND t.team_id = ?
      WHERE f.id = ? AND f.published = ? AND f.deleted_at IS NULL AND
        (SELECT COUNT(*) FROM answers a WHERE a.form_id = f.id AND a.team_id = t.team_id
          AND a.part_id IN (SELECT value FROM json_each(?))) = ?
      ON CONFLICT DO NOTHING`,
    partId, responseId, JSON.stringify(values), now(), teamId, formId, form.published,
    JSON.stringify(priorParts), priorParts.length),
    statement(db, queueSql, formId),
    statement(db, 'UPDATE forms SET revision = revision + 1 WHERE id = ? AND changes() > 0', formId),
    statement(db, `SELECT t.number, a.response_id FROM teams t JOIN answers a
      ON a.form_id = t.form_id AND a.team_id = t.team_id
      WHERE t.form_id = ? AND t.team_id = ? AND a.part_id = ?`, formId, teamId, partId)
  ]);
  const stored = data.results[0];
  if (!stored) throw new RequestError('Tento Part teď není aktivní. Obnov formulář a zkus to znovu.', 409);
  return { ok: true, duplicate: !saved.meta.changes, teamLabel: teamLabel(stored.number),
    roundId: partId, roundNumber: part.number, complete: part.number === rounds.length };
}

async function session(db, id) {
  const formId = requireId(id);
  const [forms, teams, answers, opens, exports] = await db.batch([
    statement(db, formSql, formId),
    statement(db, 'SELECT * FROM teams WHERE form_id = ? ORDER BY number', formId),
    statement(db, 'SELECT * FROM answers WHERE form_id = ?', formId),
    statement(db, 'SELECT part_id, COUNT(*) count FROM part_opens WHERE form_id = ? GROUP BY part_id', formId),
    statement(db, 'SELECT * FROM sheet_exports WHERE form_id = ?', formId)
  ]);
  const form = forms.results[0];
  if (!form?.published) throw unavailable();
  const schema = readSchema(form.published);
  const rounds = schemaRounds(schema);
  const teamAnswers = Map.groupBy(answers.results, row => row.team_id);
  const partAnswers = Map.groupBy(answers.results, row => row.part_id);
  const distributed = new Map(opens.results.map(row => [row.part_id, row.count]));
  const exported = exports.results[0];
  return {
    formId, schema, publishedAt: form.published_at, revision: String(form.revision),
    spreadsheetUrl: sheetUrl(exported?.spreadsheet_id), exportPending: (exported?.requested_version || 0) > (exported?.completed_version || 0),
    exportError: exported?.last_error || '',
    rounds: rounds.map(round => ({ ...partCounts(round, distributed.get(round.id), partAnswers.get(round.id)?.length),
      title: round.title, instructions: round.instructions, fields: round.fields })),
    teams: teams.results.map(team => {
      const byPart = new Map((teamAnswers.get(team.team_id) || []).map(answer => [answer.part_id, answer]));
      const completedRoundIds = rounds.filter(round => byPart.has(round.id)).map(round => round.id);
      const submitted = completedRoundIds.length === rounds.length;
      return { teamId: team.team_id, teamLabel: teamLabel(team.number), openedAt: team.opened_at,
        submitted, submittedAt: submitted ? byPart.get(rounds.at(-1).id).submitted_at : '', completedRoundIds };
    }),
    answersByTeamRound: Object.fromEntries([...teamAnswers].map(([teamId, items]) => [
      teamId, Object.fromEntries(items.map(item => [
        item.part_id, { submittedAt: item.submitted_at, answers: readSchema(item.answers_json) }
      ]))
    ]))
  };
}

async function demoSubmit(db, input) {
  if (input?.cardId !== 'kompetence' || !isObject(input.answers)
    || !Object.values(input.answers).every(value => typeof value === 'string')) {
    throw new RequestError('Neplatná odpověď.');
  }
  const result = await statement(db, 'INSERT OR IGNORE INTO demo_answers VALUES (?, ?, ?, ?)',
    requireId(input.responseId), input.cardId, JSON.stringify(input.answers), now()).run();
  return { ok: true, duplicate: !result.meta.changes };
}

export const publicActions = {
  getParticipantRoundView: participant,
  submitParticipantResponse: submit,
  getRoundLockState: (_db, input) => ({ ok: true, roundId: requireId(input?.roundId), unlocked: true, lockingEnabled: false }),
  submitResponse: demoSubmit
};

export const adminActions = {
  getHomeFormSummaries: home,
  getFormDraft,
  saveFormDraft: saveForm,
  publishFormDraft: (db, payload) => saveForm(db, payload, true),
  deleteFormDraft: deleteForm,
  duplicateFormDraft: duplicateForm,
  listTemplates,
  getTemplateDraft: getTemplate,
  saveTemplateDraft: saveTemplate,
  duplicateTemplateDraft: (db, id) => templateCopy(db, id, false),
  createFormFromTemplate: (db, id) => templateCopy(db, id, true),
  deleteTemplateDraft: async (db, id) => {
    const result = await statement(db, 'DELETE FROM templates WHERE id = ?', requireId(id)).run();
    return { ok: true, deleted: !!result.meta.changes };
  },
  getSessionView: session,
  getSessionRevision: async (db, id) => {
    const formId = requireId(id);
    const form = await statement(db, formSql, formId).first();
    return { formId, revision: form ? String(form.revision) : '' };
  },
  retrySheetExport: async (db, id) => {
    const formId = requireId(id);
    await statement(db, `UPDATE sheet_exports SET retry_after = 0
      WHERE form_id = ? AND requested_version > completed_version`, formId).run();
    return { ok: true };
  }
};
