const TEMPLATES_SHEET = 'TEMPLATES';
const TEMPLATE_HEADERS = ['template_id','internal_title','public_title','schema_json','created_at','updated_at'];

function listTemplates() {
  return templateRepositoryList_(openCentralStore_());
}

function getTemplateDraft(templateId) {
  if (!templateId) throw new Error('Chybí template_id.');
  return templateRepositoryGet_(templateId, openCentralStore_());
}

function saveTemplateDraft(payload) {
  if (!payload || !payload.templateId || !payload.schema) throw new Error('Neplatná šablona.');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    return templateRepositorySave_(payload, openCentralStore_());
  } finally {
    lock.releaseLock();
  }
}

function duplicateTemplateDraft(templateId) {
  const central = openCentralStore_();
  const source = templateRepositoryGet_(templateId, central);
  if (!source || !source.schema) throw new Error('Šablona nebyla nalezena.');

  const copy = JSON.parse(JSON.stringify(source.schema));
  const newId = 'tpl_' + Utilities.getUuid();
  copy.templateId = newId;
  copy.internalTitle = (copy.internalTitle || 'Šablona') + ' — kopie';
  delete copy.formId;

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    templateRepositorySave_({templateId:newId, schema:copy}, central);
  } finally {
    lock.releaseLock();
  }
  return {ok:true, templateId:newId};
}

function deleteTemplateDraft(templateId) {
  if (!templateId) throw new Error('Chybí template_id.');
  const sheet = getTemplatesStore_(openCentralStore_());
  if (!sheet) return {ok:true, deleted:false};
  const rowIndex = findTemplateRow_(sheet, templateId);
  if (!rowIndex) return {ok:true, deleted:false};
  sheet.deleteRow(rowIndex);
  return {ok:true, deleted:true};
}

function createFormFromTemplate(templateId) {
  const central = openCentralStore_();
  const source = templateRepositoryGet_(templateId, central);
  if (!source || !source.schema) throw new Error('Šablona nebyla nalezena.');

  const schema = JSON.parse(JSON.stringify(source.schema));
  const formId = 'form_' + Utilities.getUuid();
  delete schema.templateId;
  schema.formId = formId;
  schema.internalTitle = String(schema.internalTitle || 'Nový formulář');

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    formRepositorySaveDraft_({formId:formId, schema:schema}, central);
  } finally {
    lock.releaseLock();
  }
  return {ok:true, formId:formId};
}

function getOrCreateTemplatesSheet_(spreadsheet) {
  // Compatibility alias for legacy mutating paths. Read paths must use getTemplatesStore_().
  return ensureTemplatesStore_(spreadsheet);
}

function findTemplateRow_(sheet, templateId) {
  if (sheet.getLastRow() < 2) return 0;
  const ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().flat();
  const index = ids.findIndex(id => String(id) === String(templateId));
  return index === -1 ? 0 : index + 2;
}
