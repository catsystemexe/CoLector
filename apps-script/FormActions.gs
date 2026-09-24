function deleteFormDraft(formId) {
  if (!formId) throw new Error('Chybí form_id.');

  const central = openCentralStore_();
  const sheet = getFormsStore_(central);
  if (!sheet) return { ok: true, deleted: false };

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (formRepositoryIsDistributed_(formId, central)) {
      throw new Error('Rozdaný formulář nelze smazat. Nejprve dokončete práci se Session.');
    }
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
