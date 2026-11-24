import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';

const require = createRequire(import.meta.url);
const root = new URL('../../', import.meta.url);
const workers = new URL('../', import.meta.url);
const output = new URL('dist/', workers);
const appsScript = new URL('apps-script/', root);
const code = await readFile(new URL('Code.gs', appsScript), 'utf8');
const start = code.indexOf('function getEditorRouteBootstrap_()');
const end = code.indexOf('function saveFormDraft(', start);
if (start < 0 || end < 0) throw new Error('Změnila se struktura editoru CoLectoru.');
const editorBootstrap = runInNewContext(
  code.slice(start, end) + '\ngetEditorRouteBootstrap_()',
  { ScriptApp: { getService: () => ({ getUrl: () => '' }) } },
  { timeout: 1000 }
);
const demoStart = code.indexOf('function getPrototypeCards_()');
const demo = runInNewContext(code.slice(demoStart) + '\ngetPrototypeCards_().kompetence', {}, { timeout: 1000 });

const iconLinks = [
  '<link rel="icon" href="/assets/favicon.svg">',
  '<link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">',
  '<link rel="manifest" href="/manifest.webmanifest">',
  '<script src="/client.js"></script>'
].join('\n  ');

await rm(output, { recursive: true, force: true });
await mkdir(new URL('views/', output), { recursive: true });
await cp(new URL('assets/', root), new URL('assets/', output), { recursive: true });
await cp(new URL('src/client.js', workers), new URL('client.js', output));
await cp(require.resolve('qrcodejs/qrcode.min.js'), new URL('qrcode.js', output));
await cp(require.resolve('qrcodejs/LICENSE'), new URL('qrcode-license.txt', output));
await writeFile(new URL('manifest.webmanifest', output), JSON.stringify({
  id: '/',
  name: 'CoLector',
  short_name: 'CoLector',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  background_color: '#f4f6fb',
  theme_color: '#079EAE',
  icons: [{ src: '/assets/colector-icon-512.png', sizes: '512x512', type: 'image/png' }]
}));

function escapeHtml(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

for (const name of ['Home', 'Admin', 'Forms', 'Data', 'Session', 'Participant', 'Index']) {
  let html = await readFile(new URL(name + '.html', appsScript), 'utf8');
  if (name === 'Admin') {
    html = html.replace('<script>', `<script>
      window.COLECTOR_ROUTE_FORM_ID = new URLSearchParams(location.search).get('form') || '';
      window.COLECTOR_ROUTE_NEW = new URLSearchParams(location.search).get('new') === '1';
    </script>\n<script>`).replace('</body>', editorBootstrap + '\n</body>');
  }
  if (name === 'Index') {
    html = html.replace('<?= card.title ?>', escapeHtml(demo.title))
      .replace('<?= card.instructions ?>', escapeHtml(demo.instructions || demo.subtitle))
      .replace(/<\? for .*?\?>([\s\S]*?)<\? \} \?>/, (_, fieldMarkup) => demo.fields.map(field => {
        return fieldMarkup.replaceAll('<?= field.id ?>', escapeHtml(field.id))
          .replaceAll('<?= field.label ?>', escapeHtml(field.label));
      }).join(''))
      .replace('<?!= JSON.stringify(card.id) ?>', JSON.stringify(demo.id));
  }
  if (name === 'Participant') {
    html = html.replace("responseId:makeId('response')", 'responseId:colectorApi.responseId(FORM_ID,teamId,roundId,makeId)');
  }
  if (name === 'Forms') {
    html = html.replace('function saveNow(){', 'function saveNow(onSaved){')
      .replace('.withSuccessHandler(()=>setSaved(true))', '.withSuccessHandler(()=>{setSaved(true);if(onSaved)onSaved()})')
      .replace("saveNow();setTimeout(()=>createFormFrom(currentTemplateId),250)", "clearTimeout(saveTimer);saveNow(()=>createFormFrom(currentTemplateId))");
  }
  if (name === 'Session') {
    html = html.replace('sheetButton.disabled=!(result&&result.spreadsheetUrl);', `sheetButton.disabled=!(result&&(result.spreadsheetUrl||result.exportConfigured));
      sheetButton.title=result?.exportError||(!result?.exportConfigured?'Google export není připojený':(result.exportPending?'Google Sheet čeká na aktualizaci':'Google Sheet'));`)
      .replace("sheetButton.onclick=()=>{if(sessionData&&sessionData.spreadsheetUrl)window.open(sessionData.spreadsheetUrl,'_blank','noopener')};", `sheetButton.onclick=()=>{
        if(sessionData?.spreadsheetUrl){
          window.open(sessionData.spreadsheetUrl,'_blank','noopener');
          if(!sessionData.exportError) return;
        }
        if(sessionData?.exportConfigured)colectorApi.run
          .withSuccessHandler(()=>alert('Export do Google Sheets je ve frontě.'))
          .withFailureHandler(error=>alert(error.message))
          .retrySheetExport(FORM_ID);
      };`);
    html = html.replace("if(!sessionData)contentEl.innerHTML='<div class=\"empty\"><strong>Session se nepodařilo načíst</strong>'+(message||'Zkuste stránku obnovit.')+'</div>';",
      "if(!sessionData)contentEl.textContent=message||'Session se nepodařilo načíst. Zkuste stránku obnovit.';");
  }

  html = html.replace('  <base target="_top">\n', '').replace('<meta charset="utf-8">', '<meta charset="utf-8">\n  ' + iconLinks)
    .replaceAll('<?!= JSON.stringify(appUrl) ?>', 'location.origin + "/"')
    .replaceAll('<?!= JSON.stringify(formId) ?>', 'new URLSearchParams(location.search).get("form") || ""')
    .replace('const APP_URL="";', 'const APP_URL=location.origin + "/";')
    .replaceAll('window.google&&google.script&&google.script.run', 'window.colectorApi')
    .replaceAll('google.script.run', 'colectorApi.run')
    .replaceAll('google.script.url.getLocation', 'colectorApi.getLocation')
    .replaceAll('https://cdn.jsdelivr.net/gh/davidshimjs/qrcodejs/qrcode.min.js', '/qrcode.js')
    .replaceAll('Draft uložen do Google Sheets', 'Draft uložen do CoLectoru');
  if (/<\?|google\.script/.test(html)) throw new Error('Nezpracovaná šablona ' + name);
  await writeFile(new URL('views/' + name + '.html', output), html);
}
