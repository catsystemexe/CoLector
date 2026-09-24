/**
 * Storage/repository boundary for the current Google Sheets implementation.
 *
 * Public UI/API functions should call services/repositories instead of touching
 * SpreadsheetApp directly. Read helpers never create or repair structure.
 * ensure* helpers are reserved for mutating/setup flows.
 */

function openCentralStore_() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

// ---------- FORMS repository ----------

function getFormsStore_(central) {
  return (central || openCentralStore_()).getSheetByName(FORMS_SHEET);
}

function ensureFormsStore_(central) {
  const spreadsheet = central || openCentralStore_();
  let sheet = spreadsheet.getSheetByName(FORMS_SHEET);
  let changed = false;

  if (!sheet) {
    sheet = spreadsheet.insertSheet(FORMS_SHEET);
    changed = true;
  }

  const currentWidth = sheet.getLastColumn();
  const existing = currentWidth ? sheet.getRange(1, 1, 1, currentWidth).getValues()[0] : [];
  if (existing.length < FORMS_HEADERS.length) changed = true;
  FORMS_HEADERS.forEach((header, index) => {
    if (existing[index] !== header) changed = true;
  });

  if (changed) {
    sheet.getRange(1, 1, 1, FORMS_HEADERS.length).setValues([FORMS_HEADERS]);
    sheet.setFrozenRows(1);
  }

  return sheet;
}

function formRepositoryGetDraft_(formId, central) {
  const sheet = getFormsStore_(central);
  if (!sheet) return null;
  const rowIndex = findFormRow_(sheet, formId);
  if (!rowIndex) return null;

  const values = sheet.getRange(rowIndex, 1, 1, FORMS_HEADERS.length).getValues()[0];
  let schema = null;
  try {
    schema = JSON.parse(values[3] || '{}');
  } catch (error) {
    throw new Error('Uložený form_schema není validní JSON.');
  }

  let publishedSchema = null;
  if (values[7]) {
    try { publishedSchema = JSON.parse(values[7]); } catch (error) { publishedSchema = null; }
  }

  return {
    formId: values[0],
    internalTitle: values[1] || '',
    title: values[2] || '',
    schema: schema,
    status: values[4] || 'draft',
    createdAt: toIso_(values[5]),
    updatedAt: toIso_(values[6]),
    publishedAt: toIso_(values[8]),
    publishedSchema: publishedSchema
  };
}

function formRepositoryGetPublished_(formId, central) {
  const sheet = getFormsStore_(central);
  if (!sheet) return null;
  const rowIndex = findFormRow_(sheet, formId);
  if (!rowIndex) return null;

  const values = sheet.getRange(rowIndex, 1, 1, FORMS_HEADERS.length).getValues()[0];
  if (!values[7]) return null;

  let schema = null;
  try {
    schema = JSON.parse(values[7]);
  } catch (error) {
    throw new Error('Publikovaný form_schema není validní JSON.');
  }

  return { formId: values[0], schema: schema, publishedAt: toIso_(values[8]) };
}

function formRepositoryList_(central) {
  const sheet = getFormsStore_(central);
  if (!sheet || sheet.getLastRow() < 2) return [];

  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, FORMS_HEADERS.length).getValues();
  return values.map(row => {
    let schema = {};
    try { schema = JSON.parse(row[3] || '{}'); } catch (error) {}
    return {
      formId: row[0],
      internalTitle: row[1] || schema.internalTitle || '',
      title: row[2] || schema.title || '',
      status: row[4] || 'draft',
      createdAt: toIso_(row[5]),
      updatedAt: toIso_(row[6]),
      publishedAt: toIso_(row[8])
    };
  }).sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
}

function formRepositorySaveDraft_(payload, central) {
  const schema = payload.schema;
  schema.formId = payload.formId;
  const sheet = ensureFormsStore_(central);
  const now = new Date();
  const rowIndex = findFormRow_(sheet, payload.formId);
  const existing = rowIndex ? sheet.getRange(rowIndex, 1, 1, FORMS_HEADERS.length).getValues()[0] : [];
  const row = [
    payload.formId,
    String(schema.internalTitle || ''),
    String(schema.title || ''),
    JSON.stringify(schema),
    existing[4] || 'draft',
    existing[5] || now,
    now,
    existing[7] || '',
    existing[8] || ''
  ];
  if (rowIndex) sheet.getRange(rowIndex, 1, 1, row.length).setValues([row]);
  else sheet.appendRow(row);
  return { ok: true, formId: payload.formId, updatedAt: now.toISOString() };
}

function formRepositoryPublish_(payload, central) {
  const schema = payload.schema;
  schema.formId = payload.formId;
  const sheet = ensureFormsStore_(central);
  const now = new Date();
  const rowIndex = findFormRow_(sheet, payload.formId);
  const existing = rowIndex ? sheet.getRange(rowIndex, 1, 1, FORMS_HEADERS.length).getValues()[0] : [];
  const row = [
    payload.formId,
    String(schema.internalTitle || ''),
    String(schema.title || ''),
    JSON.stringify(schema),
    'published',
    existing[5] || now,
    now,
    JSON.stringify(schema),
    now
  ];
  if (rowIndex) sheet.getRange(rowIndex, 1, 1, row.length).setValues([row]);
  else sheet.appendRow(row);
  return { ok: true, formId: payload.formId, publishedAt: now.toISOString() };
}

// ---------- TEMPLATES repository ----------

function getTemplatesStore_(central) {
  return (central || openCentralStore_()).getSheetByName(TEMPLATES_SHEET);
}

function ensureTemplatesStore_(central) {
  const spreadsheet = central || openCentralStore_();
  let sheet = spreadsheet.getSheetByName(TEMPLATES_SHEET);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(TEMPLATES_SHEET);
    sheet.getRange(1, 1, 1, TEMPLATE_HEADERS.length).setValues([TEMPLATE_HEADERS]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function templateRepositoryList_(central) {
  const sheet = getTemplatesStore_(central);
  if (!sheet || sheet.getLastRow() < 2) return [];

  return sheet.getRange(2, 1, sheet.getLastRow() - 1, TEMPLATE_HEADERS.length).getValues()
    .map(row => {
      let schema = {};
      try { schema = JSON.parse(String(row[3] || '{}')); } catch (error) {}
      return {
        templateId: String(row[0] || ''),
        internalTitle: String(row[1] || ''),
        title: String(row[2] || ''),
        createdAt: row[4] ? new Date(row[4]).toISOString() : '',
        updatedAt: row[5] ? new Date(row[5]).toISOString() : '',
        fieldCount: Array.isArray(schema.fields) ? schema.fields.length : 0
      };
    })
    .filter(item => item.templateId)
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

function templateRepositoryGet_(templateId, central) {
  const sheet = getTemplatesStore_(central);
  if (!sheet) return null;
  const rowIndex = findTemplateRow_(sheet, templateId);
  if (!rowIndex) return null;

  const row = sheet.getRange(rowIndex, 1, 1, TEMPLATE_HEADERS.length).getValues()[0];
  let schema = {};
  try { schema = JSON.parse(String(row[3] || '{}')); } catch (error) {}
  return {
    templateId: String(row[0] || ''),
    schema: schema,
    createdAt: row[4] ? new Date(row[4]).toISOString() : '',
    updatedAt: row[5] ? new Date(row[5]).toISOString() : ''
  };
}

function templateRepositorySave_(payload, central) {
  const sheet = ensureTemplatesStore_(central);
  const now = new Date();
  const rowIndex = findTemplateRow_(sheet, payload.templateId);
  const existing = rowIndex ? sheet.getRange(rowIndex, 1, 1, TEMPLATE_HEADERS.length).getValues()[0] : [];
  const schema = JSON.parse(JSON.stringify(payload.schema));
  schema.templateId = payload.templateId;
  delete schema.formId;

  const row = [
    payload.templateId,
    String(schema.internalTitle || 'Nová šablona'),
    String(schema.title || ''),
    JSON.stringify(schema),
    existing[4] || now,
    now
  ];

  if (rowIndex) sheet.getRange(rowIndex, 1, 1, row.length).setValues([row]);
  else sheet.appendRow(row);

  return { ok: true, templateId: payload.templateId, updatedAt: now.toISOString() };
}

// ---------- FORM DATA stores ----------

function getFormDataRegistryStore_(central) {
  return (central || openCentralStore_()).getSheetByName(FORM_DATA_REGISTRY_SHEET);
}

function ensureFormDataRegistryStore_(central) {
  const spreadsheet = central || openCentralStore_();
  let sheet = spreadsheet.getSheetByName(FORM_DATA_REGISTRY_SHEET);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(FORM_DATA_REGISTRY_SHEET);
    sheet.getRange(1, 1, 1, FORM_DATA_REGISTRY_HEADERS.length).setValues([FORM_DATA_REGISTRY_HEADERS]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function findFormDataRecord_(registry, formId) {
  if (!registry || registry.getLastRow() < 2) return null;
  const rows = registry.getRange(2, 1, registry.getLastRow() - 1, FORM_DATA_REGISTRY_HEADERS.length).getValues();
  const row = rows.find(item => String(item[0]) === String(formId));
  if (!row) return null;
  return {
    formId: String(row[0] || ''),
    spreadsheetId: String(row[1] || ''),
    spreadsheetUrl: String(row[2] || ''),
    createdAt: row[3] || ''
  };
}

function getTeamsStore_(spreadsheet) {
  return spreadsheet ? spreadsheet.getSheetByName(FORM_TEAMS_SHEET) : null;
}

function ensureTeamsStore_(spreadsheet) {
  let sheet = getTeamsStore_(spreadsheet);
  if (sheet) return sheet;

  sheet = spreadsheet.insertSheet(FORM_TEAMS_SHEET);
  sheet.getRange(1, 1, 1, FORM_TEAMS_HEADERS.length).setValues([FORM_TEAMS_HEADERS]);
  sheet.setFrozenRows(1);

  const meta = getMetaStore_(spreadsheet);
  if (meta && meta.getLastRow() > 1) {
    const rows = meta.getRange(2, 1, meta.getLastRow() - 1, Math.min(FORM_META_HEADERS.length, meta.getLastColumn())).getValues();
    const seen = {};
    const seedRows = [];
    rows.forEach(row => {
      const teamId = String(row[2] || '');
      if (!teamId || seen[teamId]) return;
      seen[teamId] = true;
      seedRows.push([teamId, String(row[3] || ''), row[0] || new Date(), row[0] || new Date()]);
    });
    if (seedRows.length) sheet.getRange(2, 1, seedRows.length, FORM_TEAMS_HEADERS.length).setValues(seedRows);
  }

  return sheet;
}

function getMetaStore_(spreadsheet) {
  return spreadsheet ? spreadsheet.getSheetByName('_META') : null;
}

function ensureMetaStore_(spreadsheet) {
  let meta = getMetaStore_(spreadsheet);
  let changed = false;
  if (!meta) {
    meta = spreadsheet.insertSheet('_META');
    changed = true;
  }
  if (meta.getMaxColumns() < FORM_META_HEADERS.length) {
    meta.insertColumnsAfter(meta.getMaxColumns(), FORM_META_HEADERS.length - meta.getMaxColumns());
    changed = true;
  }

  const current = meta.getRange(1, 1, 1, FORM_META_HEADERS.length).getValues()[0].map(String);
  if (!FORM_META_HEADERS.every((header, index) => current[index] === header)) {
    meta.getRange(1, 1, 1, FORM_META_HEADERS.length).setValues([FORM_META_HEADERS]);
    changed = true;
  }
  if (changed) meta.setFrozenRows(1);
  return meta;
}

function getPartOpensStore_(spreadsheet) {
  return spreadsheet ? spreadsheet.getSheetByName(FORM_PART_OPENS_SHEET) : null;
}

function ensurePartOpensStore_(spreadsheet, rounds) {
  let sheet = getPartOpensStore_(spreadsheet);
  if (sheet) return sheet;

  sheet = spreadsheet.insertSheet(FORM_PART_OPENS_SHEET);
  sheet.getRange(1, 1, 1, FORM_PART_OPENS_HEADERS.length).setValues([FORM_PART_OPENS_HEADERS]);
  sheet.setFrozenRows(1);

  const seen = {};
  const rows = [];
  const firstRoundId = rounds && rounds[0] ? String(rounds[0].id) : '';
  const teams = getTeamsStore_(spreadsheet);

  if (firstRoundId && teams && teams.getLastRow() > 1) {
    teams.getRange(2, 1, teams.getLastRow() - 1, 3).getValues().forEach(row => {
      const teamId = String(row[0] || '');
      if (!teamId) return;
      const key = teamId + '|' + firstRoundId;
      if (seen[key]) return;
      seen[key] = true;
      rows.push([teamId, firstRoundId, row[2] || new Date()]);
    });
  }

  const meta = getMetaStore_(spreadsheet);
  if (meta && meta.getLastRow() > 1) {
    meta.getRange(2, 1, meta.getLastRow() - 1, FORM_META_HEADERS.length).getValues().forEach(row => {
      const teamId = String(row[2] || '');
      const roundId = String(row[8] || firstRoundId);
      if (!teamId || !roundId) return;
      const key = teamId + '|' + roundId;
      if (seen[key]) return;
      seen[key] = true;
      rows.push([teamId, roundId, row[0] || new Date()]);
    });
  }

  if (rows.length) sheet.getRange(2, 1, rows.length, FORM_PART_OPENS_HEADERS.length).setValues(rows);
  return sheet;
}
