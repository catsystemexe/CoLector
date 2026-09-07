const TEMPLATES_SHEET = 'TEMPLATES';
const TEMPLATE_HEADERS = ['template_id','internal_title','public_title','schema_json','created_at','updated_at'];

function listTemplates() {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = getOrCreateTemplatesSheet_(spreadsheet);
  if (sheet.getLastRow() < 2) return [];

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

function getTemplateDraft(templateId) {
  if (!templateId) throw new Error('Chybí template_id.');
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = getOrCreateTemplatesSheet_(spreadsheet);
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

function saveTemplateDraft(payload) {
  if (!payload || !payload.templateId || !payload.schema) throw new Error('Neplatná šablona.');

  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = getOrCreateTemplatesSheet_(spreadsheet);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
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

    return {ok:true, templateId:payload.templateId, updatedAt:now.toISOString()};
  } finally {
    lock.releaseLock();
  }
}

function duplicateTemplateDraft(templateId) {
  const source = getTemplateDraft(templateId);
  if (!source || !source.schema) throw new Error('Šablona nebyla nalezena.');

  const copy = JSON.parse(JSON.stringify(source.schema));
  const newId = 'tpl_' + Utilities.getUuid();
  copy.templateId = newId;
  copy.internalTitle = (copy.internalTitle || 'Šablona') + ' — kopie';
  delete copy.formId;

  saveTemplateDraft({templateId:newId, schema:copy});
  return {ok:true, templateId:newId};
}

function deleteTemplateDraft(templateId) {
  if (!templateId) throw new Error('Chybí template_id.');
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = getOrCreateTemplatesSheet_(spreadsheet);
  const rowIndex = findTemplateRow_(sheet, templateId);
  if (!rowIndex) return {ok:true, deleted:false};
  sheet.deleteRow(rowIndex);
  return {ok:true, deleted:true};
}

function createFormFromTemplate(templateId) {
  const source = getTemplateDraft(templateId);
  if (!source || !source.schema) throw new Error('Šablona nebyla nalezena.');

  const schema = JSON.parse(JSON.stringify(source.schema));
  const formId = 'form_' + Utilities.getUuid();
  delete schema.templateId;
  schema.formId = formId;
  schema.internalTitle = String(schema.internalTitle || 'Nový formulář');

  saveFormDraft({formId:formId, schema:schema});
  return {ok:true, formId:formId};
}

function getOrCreateTemplatesSheet_(spreadsheet) {
  let sheet = spreadsheet.getSheetByName(TEMPLATES_SHEET);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(TEMPLATES_SHEET);
    sheet.getRange(1, 1, 1, TEMPLATE_HEADERS.length).setValues([TEMPLATE_HEADERS]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function findTemplateRow_(sheet, templateId) {
  if (sheet.getLastRow() < 2) return 0;
  const ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().flat();
  const index = ids.findIndex(id => String(id) === String(templateId));
  return index === -1 ? 0 : index + 2;
}
