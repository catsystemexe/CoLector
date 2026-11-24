export class RequestError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export function requireId(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,160}$/.test(value)) {
    throw new RequestError('Neplatný identifikátor.');
  }
  return value;
}

export function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function schemaRounds(schema) {
  if (!schema) return [];
  const rounds = schema.rounds?.length ? schema.rounds : [schema];
  return rounds.map((round, index) => ({
    id: String(rounds === schema.rounds && round.id || 'round_' + (index + 1)),
    number: index + 1,
    title: String(round.title || ''),
    instructions: String(round.instructions || ''),
    fields: Array.isArray(round.fields) ? round.fields : []
  }));
}

export function validateSchema(schema) {
  if (!isObject(schema) || (schema.rounds !== undefined
    && (!Array.isArray(schema.rounds) || !schema.rounds.every(isObject)))) {
    throw new RequestError('Neplatné schéma formuláře.');
  }
  const rounds = schemaRounds(schema);
  const ids = new Set();
  for (const round of rounds) {
    requireId(round.id);
    if (ids.has(round.id) || !round.fields.every(isObject)) throw new RequestError('Neplatná struktura Partu.');
    ids.add(round.id);
  }
}

export function readSchema(value) {
  return value ? JSON.parse(value) : null;
}

export function sheetUrl(id) {
  return id ? 'https://docs.google.com/spreadsheets/d/' + encodeURIComponent(id) + '/edit' : '';
}

export function describeForm(form) {
  const schema = readSchema(form.draft);
  return {
    formId: form.id,
    internalTitle: schema.internalTitle || '',
    title: schema.title || '',
    schema,
    status: form.published ? 'published' : 'draft',
    createdAt: form.created_at,
    updatedAt: form.updated_at,
    publishedAt: form.published_at || '',
    publishedSchema: readSchema(form.published)
  };
}

export function roundStates(rounds) {
  return rounds.map(round => ({
    roundId: round.id, number: round.number, unlocked: true, lockingEnabled: false
  }));
}

export function answerFields(round) {
  return round.fields.filter(field => ['textarea', 'checkbox', 'yes_no'].includes(field.type));
}

export function cleanAnswers(part, values) {
  if (!isObject(values)) throw new RequestError('Neplatná odpověď formuláře.');
  const fields = new Map(answerFields(part).map(field => [field.id, field]));
  return Object.fromEntries(Object.entries(values).map(([id, value]) => {
    const field = fields.get(id);
    const options = field?.type === 'checkbox'
      ? (field.options || []).map(option => String(option.id || option.label || ''))
      : null;
    const valid = options
      ? Array.isArray(value) && value.every(option => options.includes(option))
      : typeof value === 'string' && (field?.type !== 'yes_no' || ['', 'yes', 'no'].includes(value));
    if (!field || !valid) throw new RequestError('Odpověď neodpovídá polím formuláře.');
    return [id, value];
  }));
}
