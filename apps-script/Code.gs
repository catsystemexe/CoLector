function doGet(e) {
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

function getPrototypeCards_() {
  return {
    kompetence: {
      id: 'kompetence',
      title: 'Kompetence',
      instructions: 'Sepište stručně pohled skupiny. Prototyp zatím data neodesílá.',
      fields: [
        { id: 'teacher_view', type: 'textarea', label: 'Pohled učitele' },
        { id: 'assistant_view', type: 'textarea', label: 'Pohled asistenta' },
        { id: 'clarify', type: 'textarea', label: 'Co je potřeba vyjasnit?' }
      ]
    }
  };
}
