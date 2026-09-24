function deleteFormDraft(formId) {
  if (!formId) throw new Error('Chybí form_id.');

  const central = openCentralStore_();
  const sheet = getFormsStore_(central);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const rowIndex = sheet ? findFormRow_(sheet, formId) : 0;
    const dataRecord = getFormDataRecord_(formId, central);

    if (rowIndex) sheet.deleteRow(rowIndex);
    formRuntimeRepositoryDelete_(formId, central);
    deleteFormDataRecord_(formId, central);

    const properties = PropertiesService.getScriptProperties();
    properties.deleteProperty(ROUND_STATE_PREFIX + formId);
    properties.deleteProperty(SESSION_REVISION_PREFIX + formId);

    return {
      ok:true,
      deleted:!!rowIndex,
      sessionDeleted:true,
      sheetPreserved:!!(dataRecord && dataRecord.spreadsheetId),
      spreadsheetUrl:dataRecord ? dataRecord.spreadsheetUrl : ''
    };
  } finally {
    lock.releaseLock();
  }
}

function duplicateFormDraft(formId) {
  if (!formId) throw new Error('Chybí form_id.');

  const central = openCentralStore_();
  const source = formRepositoryGetDraft_(formId, central);
  if (!source || !source.schema) throw new Error('Formulář nebyl nalezen.');

  const schema = JSON.parse(JSON.stringify(source.schema));
  const newFormId = 'form_' + Utilities.getUuid();
  schema.formId = newFormId;
  schema.internalTitle = String(schema.internalTitle || schema.title || 'Nový formulář') + ' – kopie';

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    formRepositorySaveDraft_({ formId: newFormId, schema: schema }, central);
  } finally {
    lock.releaseLock();
  }

  return {
    ok: true,
    formId: newFormId,
    internalTitle: schema.internalTitle
  };
}
