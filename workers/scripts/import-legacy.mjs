import { readFile } from 'node:fs/promises';
import { requireId, validateSchema } from '../src/forms.js';

const input = process.argv[2];
if (!input) {
  console.error('Použití: node scripts/import-legacy.mjs snapshot.json > /bezpecna/cesta/import.sql');
  process.exit(2);
}

const snapshot = JSON.parse(await readFile(input, 'utf8'));
const ranges = snapshot.valueRanges || [];
const getSheet = name => ranges.find(item => item.range.replaceAll("'", '').split('!')[0] === name)?.values || snapshot[name];
const fallbackDate = new Date().toISOString();

function rows(name, idColumn) {
  const [header, ...items] = getSheet(name) || [];
  if (!header?.includes(idColumn) || !header.includes('schema_json')) {
    throw new Error('Chybí hlavička listu ' + name);
  }
  const records = items.map(values => Object.fromEntries(header.map((column, i) => [column, values[i]])));
  return records.filter(record => record[idColumn]);
}

function sql(text) {
  return "'" + text.replaceAll("'", "''") + "'";
}

function timestamp(value) {
  return typeof value === 'string' && /^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(value)
    && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : fallbackDate;
}

function statements(name, idColumn, table, schemaColumn) {
  return rows(name, idColumn).map(row => {
    const id = requireId(row[idColumn]);
    const schema = JSON.parse(row.schema_json);
    validateSchema(schema);
    const values = [id, JSON.stringify(schema), timestamp(row.created_at), timestamp(row.updated_at)].map(sql);
    return `INSERT INTO ${table}(id,${schemaColumn},created_at,updated_at) VALUES (${values.join(',')}) ON CONFLICT(id) DO NOTHING;`;
  });
}

const templates = statements('TEMPLATES', 'template_id', 'templates', 'schema_json');
const forms = statements('FORMS', 'form_id', 'forms', 'draft');
console.log([...templates, ...forms].join('\n'));
console.error(`Připraveno ${forms.length} draftů a ${templates.length} šablon.`);
