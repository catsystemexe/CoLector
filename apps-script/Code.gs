const SPREADSHEET_ID = '1YWlpsu_LbDOVtf4dE6f0iqzJYyasfhJ4-gCWZVib0sk';
const RESPONSES_SHEET = 'RESPONSES';

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
