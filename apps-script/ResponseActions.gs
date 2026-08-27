const FORM_DATA_REGISTRY_SHEET = 'FORM_DATA';
const FORM_DATA_REGISTRY_HEADERS = ['form_id', 'spreadsheet_id', 'spreadsheet_url', 'created_at'];

function submitParticipantResponse(payload) {
  if (!payload || !payload.formId || !payload.teamId || !payload.responseId || !payload.answers) {
    throw new Error('Neplatná odpověď formuláře.');
  }

  const published = getPublishedForm(payload.formId);
  if (!published || !published.schema) throw new Error('Formulář není publikovaný.');

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const target = getOrCreateFormDataSpreadsheet_(payload.formId, published.schema);
    const responses = target.getSheetByName('ODPOVĚDI');
    const meta = target.getSheetByName('_META');

    if (hasResponseId_(meta, payload.responseId)) {
      return { ok: true, duplicate: true, teamLabel: findTeamLabel_(meta, payload.teamId) || '' };
    }

    const teamLabel = findTeamLabel_(meta, payload.teamId) || nextTeamLabel_(meta);
    ensureResponseHeaders_(responses, published.schema);
    upsertTeamResponse_(responses, teamLabel, published.schema, payload.answers);

    meta.appendRow([
      new Date(),
      payload.formId,
      payload.teamId,
      teamLabel,
      payload.responseId,
      'online',
      published.publishedAt || '',
      JSON.stringify(payload.answers)
    ]);

    return { ok: true, duplicate: false, teamLabel: teamLabel };
  } finally {
    lock.releaseLock();
  }
}

function getOrCreateFormDataSpreadsheet_(formId, schema) {
  const central = SpreadsheetApp.openById(SPREADSHEET_ID);
  const registry = getOrCreateFormDataRegistry_(central);
  const lastRow = registry.getLastRow();
  if (lastRow > 1) {
    const rows = registry.getRange(2, 1, lastRow - 1, FORM_DATA_REGISTRY_HEADERS.length).getValues();
    const match = rows.find(row => row[0] === formId);
    if (match && match[1]) {
      try { return SpreadsheetApp.openById(match[1]); } catch (error) {}
    }
  }

  const title = String(schema.internalTitle || schema.title || 'Formulář').trim() || 'Formulář';
  const spreadsheet = SpreadsheetApp.create('CoLector — ' + title);

  const first = spreadsheet.getSheets()[0];
  first.setName('ODPOVĚDI');
  first.clear();
  const meta = spreadsheet.insertSheet('_META');
  meta.getRange(1, 1, 1, 8).setValues([[
    'timestamp', 'form_id', 'team_id', 'team_label', 'response_id', 'source', 'published_at', 'answers_json'
  ]]);
  meta.setFrozenRows(1);
  ensureResponseHeaders_(first, schema);

  registry.appendRow([formId, spreadsheet.getId(), spreadsheet.getUrl(), new Date()]);
  return spreadsheet;
}

function getOrCreateFormDataRegistry_(spreadsheet) {
  let sheet = spreadsheet.getSheetByName(FORM_DATA_REGISTRY_SHEET);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(FORM_DATA_REGISTRY_SHEET);
    sheet.getRange(1, 1, 1, FORM_DATA_REGISTRY_HEADERS.length).setValues([FORM_DATA_REGISTRY_HEADERS]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function participantFields_(schema) {
  return (schema.fields || []).filter(field => ['textarea', 'checkbox', 'yes_no'].includes(field.type));
}

function ensureResponseHeaders_(sheet, schema) {
  const fields = participantFields_(schema);
  const headers = ['Tým'].concat(fields.map((field, index) => String(field.label || ('Položka ' + (index + 1)))));
  const width = Math.max(1, headers.length);
  const currentWidth = Math.max(sheet.getLastColumn(), width);
  if (sheet.getLastRow() < 1 || sheet.getRange(1, 1).getValue() !== 'Tým' || currentWidth !== width) {
    sheet.getRange(1, 1, 1, width).setValues([headers]);
    sheet.setFrozenRows(1);
  } else {
    sheet.getRange(1, 1, 1, width).setValues([headers]);
  }
}

function upsertTeamResponse_(sheet, teamLabel, schema, answers) {
  const fields = participantFields_(schema);
  const row = [teamLabel].concat(fields.map(field => normalizeAnswerForSheet_(field, answers[field.id])));
  let rowIndex = 0;
  if (sheet.getLastRow() > 1) {
    const labels = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().flat();
    const index = labels.indexOf(teamLabel);
    if (index !== -1) rowIndex = index + 2;
  }
  if (rowIndex) sheet.getRange(rowIndex, 1, 1, row.length).setValues([row]);
  else sheet.appendRow(row);
}

function normalizeAnswerForSheet_(field, value) {
  if (field.type === 'checkbox') {
    const selected = Array.isArray(value) ? value : [];
    const labels = selected.map(id => {
      const option = (field.options || []).find(item => String(item.id || item.label || '') === String(id));
      return option ? String(option.label || '') : String(id || '');
    }).filter(Boolean);
    return labels.join(', ');
  }
  if (field.type === 'yes_no') return value === 'yes' ? 'Ano' : value === 'no' ? 'Ne' : '';
  return value == null ? '' : String(value);
}

function hasResponseId_(meta, responseId) {
  const lastRow = meta.getLastRow();
  if (lastRow < 2) return false;
  return meta.getRange(2, 5, lastRow - 1, 1).getValues().flat().includes(responseId);
}

function findTeamLabel_(meta, teamId) {
  const lastRow = meta.getLastRow();
  if (lastRow < 2) return '';
  const rows = meta.getRange(2, 3, lastRow - 1, 2).getValues();
  const match = rows.find(row => row[0] === teamId);
  return match ? String(match[1] || '') : '';
}

function nextTeamLabel_(meta) {
  const lastRow = meta.getLastRow();
  if (lastRow < 2) return 'Tým 1';
  const labels = meta.getRange(2, 4, lastRow - 1, 1).getValues().flat().filter(Boolean);
  let max = 0;
  labels.forEach(label => {
    const match = String(label).match(/^Tým\s+(\d+)$/);
    if (match) max = Math.max(max, Number(match[1]));
  });
  return 'Tým ' + (max + 1);
}
