function deleteFormDraft(formId) {
  if (!formId) throw new Error('Chybí form_id.');

  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = getOrCreateFormsSheet_(spreadsheet);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const rowIndex = findFormRow_(sheet, formId);
    if (!rowIndex) return { ok: true, deleted: false };
    sheet.deleteRow(rowIndex);
    return { ok: true, deleted: true };
  } finally {
    lock.releaseLock();
  }
}

function duplicateFormDraft(formId) {
  if (!formId) throw new Error('Chybí form_id.');

  const source = getFormDraft(formId);
  if (!source || !source.schema) throw new Error('Formulář nebyl nalezen.');

  const schema = JSON.parse(JSON.stringify(source.schema));
  const newFormId = 'form_' + Utilities.getUuid();
  schema.formId = newFormId;
  schema.internalTitle = String(schema.internalTitle || schema.title || 'Nový formulář') + ' – kopie';

  saveFormDraft({ formId: newFormId, schema: schema });

  return {
    ok: true,
    formId: newFormId,
    internalTitle: schema.internalTitle
  };
}
