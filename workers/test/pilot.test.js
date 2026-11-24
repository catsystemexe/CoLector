import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { Miniflare } from 'miniflare';
import { flushSheetExports } from '../src/google-export.js';

const origin = 'https://colector.test';
const password = 'local-test-operator-password-only';
const env = { GOOGLE_EXPORT_FOLDER_ID: 'pilot_folder', GOOGLE_CLIENT_ID: 'test',
  GOOGLE_CLIENT_SECRET: 'test', GOOGLE_REFRESH_TOKEN: 'test' };
const migrationDir = new URL('../migrations/', import.meta.url);
let mf, db, cookie;

before(async () => {
  mf = new Miniflare({
    modules: true,
    modulesRules: [{ type: 'ESModule', include: ['**/*.js'] }],
    compatibilityDate: '2026-07-30',
    scriptPath: fileURLToPath(new URL('../src/worker.js', import.meta.url)),
    bindings: { ADMIN_PASSWORD: password },
    d1Databases: ['DB'],
    serviceBindings: {
      ASSETS: async request => {
        const path = new URL(request.url).pathname.slice(1);
        return new Response(await readFile(new URL('../dist/' + path, import.meta.url)));
      }
    }
  });
  db = await mf.getD1Database('DB');
  for (const name of (await readdir(migrationDir)).filter(name => name.endsWith('.sql')).sort()) {
    const ddl = await readFile(new URL(name, migrationDir), 'utf8');
    await db.batch(ddl.split(';').map(part => part.trim()).filter(Boolean).map(sql => db.prepare(sql)));
  }
  const login = await mf.dispatchFetch(origin + '/login', {
    method: 'POST', headers: { Origin: origin },
    body: new URLSearchParams({ password, next: '/' }), redirect: 'manual'
  });
  assert.equal(login.status, 303);
  assert.equal(login.headers.get('Location'), '/');
  assert.match(login.headers.get('Set-Cookie'), /HttpOnly.*Secure/);
  cookie = login.headers.get('Set-Cookie').split(';')[0];
});

after(async () => { await mf?.dispose(); });

async function action(method, args = [], admin = true, requestOrigin = origin) {
  const response = await mf.dispatchFetch(origin + '/api/action', {
    method: 'POST', headers: { Origin: requestOrigin, 'Content-Type': 'application/json',
      ...(admin ? { Cookie: cookie } : {}) },
    body: JSON.stringify({ method, args })
  });
  const { result, error } = await response.json();
  return { status: response.status, result, error };
}

const schema = { internalTitle: 'Pilot', title: 'Workshop', rounds: [
  { id: 'part_a', title: 'Otázka', fields: [{ id: 'text_a', type: 'textarea', label: 'Text' }] },
  { id: 'part_b', title: 'Volba', fields: [{ id: 'yes_no_b', label: 'Volba', type: 'yes_no' }] }
] };

test('stable launcher opens Home and public form cannot reach operator data', async () => {
  const loginPage = await mf.dispatchFetch(origin + '/');
  assert.match(await loginPage.text(), /Heslo lektora/);
  const home = await mf.dispatchFetch(origin + '/', { headers: { Cookie: cookie } });
  const html = await home.text();
  assert.match(html, /recentForms/);
  assert.doesNotMatch(html, /google\.script|<\?/);
  const participant = await mf.dispatchFetch(origin + '/?view=form&form=form_pilot');
  assert.match(await participant.text(), /colectorApi\.responseId/);
  assert.equal((await mf.dispatchFetch(origin + '/views/Home.html')).status, 404);
  assert.equal((await action('getHomeFormSummaries', [], false)).status, 401);
  assert.equal((await action('getHomeFormSummaries', [], true, 'https://other.test')).status, 403);
  assert.equal((await action('constructor')).status, 404);
  assert.equal((await action('saveFormDraft', [], false)).status, 401);
});

test('templates, editor, sequential Parts, retries, Session and isolated export', async () => {
  assert.equal((await action('saveTemplateDraft', [{ templateId: 'tpl_pilot', schema }])).status, 200);
  assert.equal((await action('listTemplates')).result[0].templateId, 'tpl_pilot');
  const { formId } = (await action('createFormFromTemplate', ['tpl_pilot'])).result;
  assert.equal((await action('getFormDraft', [formId])).result.distributed, false);
  assert.equal((await action('publishFormDraft', [{ formId, schema }])).status, 200);

  const teams = await Promise.all(['team_one', 'team_two'].map(teamId =>
    action('getParticipantRoundView', [{ formId, teamId }], false)));
  assert.deepEqual(teams.map(team => team.result.teamLabel).sort(), ['Tým 1', 'Tým 2']);
  const task = { formId, teamId: 'team_one' };
  assert.equal((await action('getFormDraft', [formId])).result.distributed, true);
  assert.equal((await action('saveFormDraft', [{ formId, schema }])).status, 409);
  const second = { ...task, roundId: 'part_b', responseId: 'response_b', answers: { yes_no_b: 'yes' } };
  assert.equal((await action('submitParticipantResponse', [second], false)).status, 409);

  const beforeSubmit = (await action('getSessionRevision', [formId])).result.revision;
  const first = { ...task, roundId: 'part_a', responseId: 'response_a', answers: { text_a: '=1+1' } };
  const retries = await Promise.all([
    action('submitParticipantResponse', [first], false),
    action('submitParticipantResponse', [{ ...first, responseId: 'response_retry' }], false)
  ]);
  assert.deepEqual(retries.map(retry => retry.result.duplicate).sort(), [false, true]);
  assert.notEqual((await action('getSessionRevision', [formId])).result.revision, beforeSubmit);
  assert.equal((await action('getParticipantRoundView', [task], false)).result.roundId, 'part_b');
  assert.equal((await action('submitParticipantResponse', [second], false)).result.complete, true);
  assert.equal((await action('getParticipantRoundView', [task], false)).result.status, 'complete');
  const session = (await action('getSessionView', [formId])).result;
  assert.deepEqual(session.rounds.map(part => [part.distributedCount, part.submittedCount]), [[2, 1], [1, 1]]);
  assert.equal(session.answersByTeamRound.team_one.part_a.answers.text_a, '=1+1');
  assert.equal(session.exportPending, true);
  assert.equal((await action('getHomeFormSummaries')).result[0].collectedCount, 1);

  let failures = 0;
  await flushSheetExports({ ...env, DB: db }, async () => {
    failures++;
    return Response.json({}, { status: 503 });
  });
  assert.equal(failures, 1);
  assert.match((await action('getSessionView', [formId])).result.exportError, /503/);
  await db.prepare('UPDATE sheet_exports SET retry_after = 0 WHERE form_id = ?').bind(formId).run();

  const calls = [];
  await flushSheetExports({ ...env, DB: db }, async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/token')) return Response.json({ access_token: 'fake-token' });
    if (url.includes('/drive/v3/files?') && options.method === 'GET') return Response.json({ files: [] });
    if (url.includes('/drive/v3/files?')) return Response.json({ id: 'pilot_spreadsheet' });
    if (url.includes('?fields=')) return Response.json({
      sheets: [{ properties: { sheetId: 0, title: 'Sheet1', gridProperties: { rowCount: 1000, columnCount: 26 } } }]
    });
    return Response.json({});
  });
  const create = calls.find(call => call.url.includes('/drive/v3/files?') && call.options.method === 'POST');
  assert.deepEqual(JSON.parse(create.options.body).parents, ['pilot_folder']);
  const write = calls.find(call => call.url.endsWith(':batchUpdate'));
  const sheetRows = JSON.parse(write.options.body).requests[1].updateCells.rows;
  assert.deepEqual(sheetRows.map(row => row.values.map(cell => cell.userEnteredValue.stringValue)),
    [['Tým', 'Part A · Text', 'Part B · Volba'], [session.teams.find(team => team.teamId === 'team_one').teamLabel, '=1+1', 'Ano']]);
  assert.equal((await action('getSessionView', [formId])).result.exportPending, false);
  assert.equal((await action('deleteFormDraft', [formId])).result.sheetPreserved, true);
  assert.equal((await action('getParticipantRoundView', [task], false)).result.status, 'unavailable');
  assert.equal((await action('getSessionView', [formId])).status, 404);
  assert.equal((await action('saveFormDraft', [{ formId, schema }])).status, 409);
});
