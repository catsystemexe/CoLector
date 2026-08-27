const SPREADSHEET_ID = '1YWlpsu_LbDOVtf4dE6f0iqzJYyasfhJ4-gCWZVib0sk';
const RESPONSES_SHEET = 'RESPONSES';
const FORMS_SHEET = 'FORMS';
const FORMS_HEADERS = [
  'form_id',
  'internal_title',
  'public_title',
  'schema_json',
  'status',
  'created_at',
  'updated_at'
];

function doGet(e) {
  const view = (e && e.parameter && e.parameter.view) || '';

  if (view === 'editor') {
    return HtmlService.createTemplateFromFile('Admin')
      .evaluate()
      .setTitle('CoLector — Editor formuláře')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  const cardId = (e && e.parameter && e.parameter.card) || 'kompetence';
  const cards = getPrototypeCards_();
  const card = cards[cardId] || cards.kompetence;

  const template = HtmlService.createTemplateFromFile('Index');
  template.card = card;

  return template
    .evaluate()
    .setTitle('CoLector')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function saveFormDraft(payload) {
  if (!payload || !payload.formId || !payload.schema) {
    throw new Error('Neplatný draft formuláře.');
  }

  const schema = payload.schema;
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = getOrCreateFormsSheet_(spreadsheet);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const now = new Date();
    const rowIndex = findFormRow_(sheet, payload.formId);
    const row = [
      payload.formId,
      String(schema.internalTitle || ''),
      String(schema.title || ''),
      JSON.stringify(schema),
      'draft',
      rowIndex ? sheet.getRange(rowIndex, 6).getValue() || now : now,
      now
    ];

    if (rowIndex) {
      sheet.getRange(rowIndex, 1, 1, row.length).setValues([row]);
    } else {
      sheet.appendRow(row);
    }

    return {
      ok: true,
      formId: payload.formId,
      updatedAt: now.toISOString()
    };
  } finally {
    lock.releaseLock();
  }
}

function getFormDraft(formId) {
  if (!formId) {
    throw new Error('Chybí form_id.');
  }

  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = getOrCreateFormsSheet_(spreadsheet);
  const rowIndex = findFormRow_(sheet, formId);
  if (!rowIndex) return null;

  const values = sheet.getRange(rowIndex, 1, 1, FORMS_HEADERS.length).getValues()[0];
  let schema = null;
  try {
    schema = JSON.parse(values[3] || '{}');
  } catch (error) {
    throw new Error('Uložený form_schema není validní JSON.');
  }

  return {
    formId: values[0],
    internalTitle: values[1],
    title: values[2],
    schema,
    status: values[4],
    createdAt: values[5] instanceof Date ? values[5].toISOString() : values[5],
    updatedAt: values[6] instanceof Date ? values[6].toISOString() : values[6]
  };
}

function listFormDrafts() {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = getOrCreateFormsSheet_(spreadsheet);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  return sheet
    .getRange(2, 1, lastRow - 1, FORMS_HEADERS.length)
    .getValues()
    .filter(row => row[0])
    .map(row => ({
      formId: row[0],
      internalTitle: row[1],
      title: row[2],
      status: row[4],
      createdAt: row[5] instanceof Date ? row[5].toISOString() : row[5],
      updatedAt: row[6] instanceof Date ? row[6].toISOString() : row[6]
    }))
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

function getOrCreateFormsSheet_(spreadsheet) {
  let sheet = spreadsheet.getSheetByName(FORMS_SHEET);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(FORMS_SHEET);
    sheet.getRange(1, 1, 1, FORMS_HEADERS.length).setValues([FORMS_HEADERS]);
    sheet.setFrozenRows(1);
  } else {
    const currentHeaders = sheet.getRange(1, 1, 1, FORMS_HEADERS.length).getValues()[0];
    const mismatch = FORMS_HEADERS.some((header, index) => currentHeaders[index] !== header);
    if (mismatch && sheet.getLastRow() <= 1) {
      sheet.getRange(1, 1, 1, FORMS_HEADERS.length).setValues([FORMS_HEADERS]);
      sheet.setFrozenRows(1);
    }
  }
  return sheet;
}

function findFormRow_(sheet, formId) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;

  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues().flat();
  const index = ids.indexOf(formId);
  return index === -1 ? 0 : index + 2;
}

function submitResponse(payload) {
  if (!payload || !payload.cardId || !payload.responseId || !payload.answers) {
    throw new Error('Neplatná odpověď.');
  }

  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = spreadsheet.getSheetByName(RESPONSES_SHEET);
  if (!sheet) {
    throw new Error('List RESPONSES nebyl nalezen.');
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      const existingIds = sheet.getRange(2, 3, lastRow - 1, 1).getValues().flat();
      if (existingIds.includes(payload.responseId)) {
        return { ok: true, duplicate: true };
      }
    }

    sheet.appendRow([
      new Date(),
      payload.cardId,
      payload.responseId,
      'online',
      JSON.stringify(payload.answers)
    ]);

    return { ok: true, duplicate: false };
  } finally {
    lock.releaseLock();
  }
}

function getPrototypeCards_() {
  return {
    kompetence: {
      id: 'kompetence',
      title: 'Kompetence',
      instructions: 'Sepište stručně pohled skupiny.',
      fields: [
        { id: 'teacher_view', type: 'textarea', label: 'Pohled učitele' },
        { id: 'assistant_view', type: 'textarea', label: 'Pohled asistenta' },
        { id: 'clarify', type: 'textarea', label: 'Co je potřeba vyjasnit?' }
      ]
    }
  };
}
