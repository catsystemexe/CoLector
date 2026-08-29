const SPREADSHEET_ID = '1YWlpsu_LbDOVtf4dE6f0iqzJYyasfhJ4-gCWZVib0sk';
const APP_ICON_URL = 'https://raw.githubusercontent.com/catsystemexe/CoLector/46ca266e143f3a528c3d5fa792fdf09faac81217/assets/apple-touch-icon.png';
const RESPONSES_SHEET = 'RESPONSES';
const FORMS_SHEET = 'FORMS';
const FORMS_HEADERS = [
  'form_id',
  'internal_title',
  'public_title',
  'schema_json',
  'status',
  'created_at',
  'updated_at',
  'published_schema_json',
  'published_at'
];

function doGet(e) {
  const params = (e && e.parameter) || {};
  const view = params.view || '';

  if (view === 'editor') return renderEditor_();
  if (view === 'session') return renderSession_(params.form || '');
  if (view === 'forms') return renderTemplatePage_('Forms', 'CoLector — Moje formuláře');
  if (view === 'data') return renderTemplatePage_('Data', 'CoLector — Data a výsledky');
  if (view === 'form') return renderParticipant_(params.form || '');
  if (view === 'home' || (!view && !params.card)) return renderTemplatePage_('Home', 'CoLector');

  const cardId = params.card || 'kompetence';
  const cards = getPrototypeCards_();
  const card = cards[cardId] || cards.kompetence;
  const template = HtmlService.createTemplateFromFile('Index');
  template.card = card;

  return template.evaluate().setTitle('CoLector')
    .setFaviconUrl(APP_ICON_URL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function renderTemplatePage_(fileName, title) {
  const template = HtmlService.createTemplateFromFile(fileName);
  template.appUrl = ScriptApp.getService().getUrl();
  return template.evaluate().setTitle(title)
    .setFaviconUrl(APP_ICON_URL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function renderSession_(formId) {
  const template = HtmlService.createTemplateFromFile('Session');
  template.formId = formId;
  template.appUrl = ScriptApp.getService().getUrl();
  return template.evaluate().setTitle('CoLector — Session')
    .setFaviconUrl(APP_ICON_URL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function renderParticipant_(formId) {
  const template = HtmlService.createTemplateFromFile('Participant');
  template.formId = formId;
  template.appUrl = ScriptApp.getService().getUrl();
  return template.evaluate().setTitle('CoLector — Formulář')
    .setFaviconUrl(APP_ICON_URL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function renderEditor_() {
  const baseHtml = HtmlService.createHtmlOutputFromFile('Admin').getContent();
  const html = baseHtml.replace('</body>', getEditorRouteBootstrap_() + '\n</body>');
  return HtmlService.createHtmlOutput(html).setTitle('CoLector — Editor formuláře')
    .setFaviconUrl(APP_ICON_URL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getEditorRouteBootstrap_() {
  const appUrl = ScriptApp.getService().getUrl();
  return `<script>
(function(){
  clearTimeout(saveTimer);
  saveTimer=null;
  const APP_URL=${JSON.stringify(appUrl)};
  const goHome=function(){window.top.location.href=APP_URL+'?view=home'};
  const participantUrl=function(formId){return APP_URL+'?view=form&form='+encodeURIComponent(formId)};

  const homeBrand=document.querySelector('.brand-wrap');
  if(homeBrand){
    homeBrand.style.cursor='pointer';homeBrand.setAttribute('role','link');homeBrand.setAttribute('tabindex','0');homeBrand.setAttribute('aria-label','Přejít na Home');
    homeBrand.addEventListener('click',goHome);
    homeBrand.addEventListener('keydown',function(event){if(event.key==='Enter'||event.key===' '){event.preventDefault();goHome()}});
  }

  const extraStyle=document.createElement('style');
  extraStyle.textContent='.editor-reset{position:absolute;top:14px;right:16px;z-index:5;width:36px;height:36px;border:0;border-radius:10px;background:transparent;color:#7a8498;display:grid;place-items:center}.editor-reset:hover{background:#f2f4f9;color:#4e5b72}.editor-reset svg{width:20px;height:20px;stroke:currentColor;fill:none;stroke-width:1.8}.header-btn.delete-form:hover{background:#fff0f1;color:#c54c56}.qr-screen{position:fixed;z-index:200;inset:0;background:#fff;display:none;flex-direction:column;align-items:center;justify-content:center;padding:28px 20px}.qr-screen.open{display:flex}.qr-close{position:absolute;top:16px;right:16px;width:44px;height:44px;border:0;border-radius:12px;background:#f1f3f8;color:#556178;font-size:26px}.qr-title{max-width:90vw;text-align:center;font-size:clamp(24px,5vw,42px);font-weight:850;color:#27334a;margin:0 0 24px}.qr-box{padding:16px;background:#fff;border-radius:18px;box-shadow:0 10px 34px rgba(25,35,58,.12)}.qr-box canvas,.qr-box img{display:block;max-width:min(72vw,72vh);height:auto!important}.qr-note{margin-top:18px;color:#7a8498;font-size:14px;text-align:center}.publish-ok{color:#279263!important}@media(max-width:760px){.editor-reset{top:10px;right:10px}.qr-screen{padding:18px 14px}.qr-close{top:10px;right:10px}}';
  document.head.appendChild(extraStyle);

  const qrScreen=document.createElement('div');
  qrScreen.className='qr-screen';
  qrScreen.innerHTML='<button class="qr-close" type="button" aria-label="Zavřít">×</button><h1 class="qr-title"></h1><div class="qr-box"></div><div class="qr-note">Naskenujte QR kód fotoaparátem telefonu.</div>';
  document.body.appendChild(qrScreen);
  qrScreen.querySelector('.qr-close').onclick=function(){qrScreen.classList.remove('open')};

  function loadQrLibrary(){
    if(window.QRCode)return Promise.resolve();
    return new Promise(function(resolve,reject){
      const existing=document.querySelector('script[data-colector-qr]');
      if(existing){existing.addEventListener('load',resolve,{once:true});existing.addEventListener('error',reject,{once:true});return}
      const script=document.createElement('script');script.src='https://cdn.jsdelivr.net/gh/davidshimjs/qrcodejs/qrcode.min.js';script.dataset.colectorQr='1';script.onload=resolve;script.onerror=reject;document.head.appendChild(script);
    });
  }

  function showQr(){
    const title=state.title||state.internalTitle||'Formulář';
    const box=qrScreen.querySelector('.qr-box');
    qrScreen.querySelector('.qr-title').textContent=title;
    box.innerHTML='';qrScreen.classList.add('open');
    loadQrLibrary().then(function(){
      const size=Math.max(220,Math.min(520,Math.floor(Math.min(window.innerWidth*.72,window.innerHeight*.62))));
      new QRCode(box,{text:participantUrl(state.formId),width:size,height:size,colorDark:'#111827',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.M});
    }).catch(function(){box.textContent='QR kód se nepodařilo načíst.'});
  }

  const headerActions=document.querySelector('.header-actions');
  const qrButton=document.getElementById('qrButton');
  const publishButton=document.getElementById('publishButton');
  const bottomBar=document.querySelector('.editor-bottom-bar');
  let publishedSnapshot=null;

  function schemaComparable(schema){
    return JSON.stringify(schema||null);
  }

  function refreshPublishState(){
    const current=publishedSnapshot&&schemaComparable(buildSchema())===schemaComparable(publishedSnapshot);
    if(bottomBar){
      bottomBar.classList.toggle('publish-current',!!current);
      bottomBar.classList.toggle('publish-pending',!current);
    }
    return !!current;
  }

  if(qrButton){
    qrButton.disabled=false;
    qrButton.addEventListener('click',function(){
      google.script.run.withSuccessHandler(function(result){
        if(!result||!result.publishedAt){alert('Formulář nejdřív publikuj.');return}
        showQr();
      }).withFailureHandler(function(error){alert((error&&error.message)||'QR se nepodařilo otevřít.')}).getFormDraft(state.formId);
    });
  }

  if(publishButton){
    publishButton.disabled=false;
    publishButton.addEventListener('click',function(){
      publishButton.disabled=true;
      const original=publishButton.innerHTML;
      publishButton.innerHTML='<span class="bottom-action-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M5 14v6h14v-6"/></svg></span><span>Publikuji…</span>';
      google.script.run.withSuccessHandler(function(){
        publishedSnapshot=JSON.parse(JSON.stringify(buildSchema()));
        refreshPublishState();
        publishButton.classList.add('publish-ok');
        publishButton.innerHTML='<span class="bottom-action-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 12 4 4 8-8"/></svg></span><span>Publikováno</span>';
        setTimeout(function(){publishButton.classList.remove('publish-ok');publishButton.innerHTML=original;publishButton.disabled=false},1400);
      }).withFailureHandler(function(error){publishButton.innerHTML=original;publishButton.disabled=false;alert((error&&error.message)||'Publikování se nepodařilo.')}).publishFormDraft({formId:state.formId,schema:buildSchema()});
    });
  }

  if(headerActions){
    const deleteButton=document.createElement('button');
    deleteButton.className='header-btn delete-form';deleteButton.type='button';deleteButton.title='Smazat formulář';deleteButton.setAttribute('aria-label','Smazat formulář');
    deleteButton.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6"/></svg><span>Smazat</span>';
    deleteButton.addEventListener('click',function(){
      if(!confirm('Opravdu chceš smazat tento formulář?'))return;
      deleteButton.disabled=true;
      google.script.run.withSuccessHandler(function(){try{localStorage.removeItem(STORAGE_KEY)}catch(e){}goHome()}).withFailureHandler(function(error){deleteButton.disabled=false;alert((error&&error.message)||'Smazání se nepodařilo.')}).deleteFormDraft(state.formId);
    });
    headerActions.appendChild(deleteButton);
  }

  const canvas=document.querySelector('.editor-canvas');
  if(canvas){
    const resetButton=document.createElement('button');
    resetButton.className='editor-reset';resetButton.type='button';resetButton.title='Vymazat obsah formuláře';resetButton.setAttribute('aria-label','Vymazat obsah formuláře');
    resetButton.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4v6h6"/><path d="M5.5 9A8 8 0 1 1 6 17.5"/></svg>';
    resetButton.addEventListener('click',function(){
      if(!confirm('Opravdu chceš vymazat obsah formuláře?'))return;
      applyEditorSchema({version:2,formId:state.formId,internalTitle:state.internalTitle||'Nový formulář',title:'',instructions:'',fields:[]});
    });
    canvas.appendChild(resetButton);
  }

  function applyEditorSchema(schema){
    clearTimeout(saveTimer);
    Object.keys(state).forEach(function(key){delete state[key]});
    Object.assign(state,schema||{});
    state.version=state.version||2;
    if(!state.formId)state.formId=createId('form');
    state.internalTitle=state.internalTitle||'Nový formulář';state.title=state.title||'';state.instructions=state.instructions||'';state.fields=Array.isArray(state.fields)?state.fields:[];
    normalizeLoadedState();internalTitleEl.value=state.internalTitle;titleEl.value=state.title;instructionsEl.value=state.instructions;autoSizeInstructions();renderEditor();renderPreview();scheduleSave();
  }

  function createBlankSchema(){return{version:2,formId:createId('form'),internalTitle:'Nový formulář',title:'',instructions:'',fields:[{id:createId('field'),type:'textarea',label:'',required:false,height:115,accent:'blue'}]}}

  document.addEventListener('input',function(){setTimeout(refreshPublishState,0)},true);
  document.addEventListener('change',function(){setTimeout(refreshPublishState,0)},true);

  google.script.url.getLocation(function(location){
    const params=(location&&location.parameter)||{};
    if(params.new==='1'){applyEditorSchema(createBlankSchema());return}
    if(params.form){
      setSaveStatus('Načítám…','saving','Načítám formulář');
      google.script.run.withSuccessHandler(function(result){if(!result||!result.schema){setSaveStatus('Nenalezeno','error','Formulář nebyl nalezen');return}publishedSnapshot=result.publishedSchema||null;applyEditorSchema(result.schema);refreshPublishState()}).withFailureHandler(function(error){const message=error&&error.message?error.message:'Formulář se nepodařilo načíst';setSaveStatus('Chyba','error',message)}).getFormDraft(params.form);
      return;
    }
    scheduleSave();
  });
})();
</script>`;
}

function saveFormDraft(payload) {
  if (!payload || !payload.formId || !payload.schema) throw new Error('Neplatný draft formuláře.');
  const schema = payload.schema;
  schema.formId = payload.formId;
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = getOrCreateFormsSheet_(spreadsheet);
  const lock = LockService.getScriptLock();lock.waitLock(10000);
  try {
    const now = new Date();
    const rowIndex = findFormRow_(sheet, payload.formId);
    const existing = rowIndex ? sheet.getRange(rowIndex,1,1,FORMS_HEADERS.length).getValues()[0] : [];
    const row = [
      payload.formId,
      String(schema.internalTitle || ''),
      String(schema.title || ''),
      JSON.stringify(schema),
      existing[4] || 'draft',
      existing[5] || now,
      now,
      existing[7] || '',
      existing[8] || ''
    ];
    if (rowIndex) sheet.getRange(rowIndex, 1, 1, row.length).setValues([row]); else sheet.appendRow(row);
    return {ok:true,formId:payload.formId,updatedAt:now.toISOString()};
  } finally {lock.releaseLock();}
}

function publishFormDraft(payload) {
  if (!payload || !payload.formId || !payload.schema) throw new Error('Neplatný formulář k publikování.');
  const schema = payload.schema;
  schema.formId = payload.formId;
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = getOrCreateFormsSheet_(spreadsheet);
  const lock = LockService.getScriptLock();lock.waitLock(10000);
  try {
    const now = new Date();
    const rowIndex = findFormRow_(sheet, payload.formId);
    const existing = rowIndex ? sheet.getRange(rowIndex,1,1,FORMS_HEADERS.length).getValues()[0] : [];
    const row = [
      payload.formId,
      String(schema.internalTitle || ''),
      String(schema.title || ''),
      JSON.stringify(schema),
      'published',
      existing[5] || now,
      now,
      JSON.stringify(schema),
      now
    ];
    if (rowIndex) sheet.getRange(rowIndex,1,1,row.length).setValues([row]); else sheet.appendRow(row);
    return {ok:true,formId:payload.formId,publishedAt:now.toISOString()};
  } finally {lock.releaseLock();}
}

function getFormDraft(formId) {
  if (!formId) throw new Error('Chybí form_id.');
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = getOrCreateFormsSheet_(spreadsheet);
  const rowIndex = findFormRow_(sheet, formId);
  if (!rowIndex) return null;
  const values = sheet.getRange(rowIndex, 1, 1, FORMS_HEADERS.length).getValues()[0];
  let schema = null;
  try {schema = JSON.parse(values[3] || '{}');} catch (error) {throw new Error('Uložený form_schema není validní JSON.');}
  let publishedSchema=null;
  if(values[7]){
    try {publishedSchema=JSON.parse(values[7]);} catch(error){publishedSchema=null;}
  }
  return {
    formId:values[0],internalTitle:values[1]||'',title:values[2]||'',schema:schema,status:values[4]||'draft',
    createdAt:toIso_(values[5]),updatedAt:toIso_(values[6]),publishedAt:toIso_(values[8]),
    publishedSchema:publishedSchema
  };
}

function getPublishedForm(formId) {
  if (!formId) return null;
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = getOrCreateFormsSheet_(spreadsheet);
  const rowIndex = findFormRow_(sheet, formId);
  if (!rowIndex) return null;
  const values = sheet.getRange(rowIndex,1,1,FORMS_HEADERS.length).getValues()[0];
  if (!values[7]) return null;
  let schema = null;
  try {schema=JSON.parse(values[7]);} catch(error){throw new Error('Publikovaný form_schema není validní JSON.');}
  return {formId:values[0],schema:schema,publishedAt:toIso_(values[8])};
}

function listFormDrafts() {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = getOrCreateFormsSheet_(spreadsheet);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const values = sheet.getRange(2, 1, lastRow - 1, FORMS_HEADERS.length).getValues();
  return values.map(row => {
    let schema = {};
    try {schema = JSON.parse(row[3] || '{}');} catch (error) {}
    return {
      formId:row[0],internalTitle:row[1]||schema.internalTitle||'',title:row[2]||schema.title||'',status:row[4]||'draft',
      createdAt:toIso_(row[5]),updatedAt:toIso_(row[6]),publishedAt:toIso_(row[8])
    };
  }).sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));
}

function getOrCreateFormsSheet_(spreadsheet) {
  let sheet = spreadsheet.getSheetByName(FORMS_SHEET);
  if (!sheet) sheet = spreadsheet.insertSheet(FORMS_SHEET);
  const currentWidth = sheet.getLastColumn();
  const width = Math.max(currentWidth, FORMS_HEADERS.length);
  const existing = currentWidth ? sheet.getRange(1,1,1,currentWidth).getValues()[0] : [];
  let changed = existing.length < FORMS_HEADERS.length;
  FORMS_HEADERS.forEach((header,index)=>{if(existing[index]!==header)changed=true;});
  if (changed) sheet.getRange(1,1,1,FORMS_HEADERS.length).setValues([FORMS_HEADERS]);
  sheet.setFrozenRows(1);
  return sheet;
}

function findFormRow_(sheet, formId) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues().flat();
  const index = ids.indexOf(formId);
  return index === -1 ? 0 : index + 2;
}

function toIso_(value) {
  if (!value) return '';
  if (value instanceof Date) return value.toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function saveResponse(payload) {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = spreadsheet.getSheetByName(RESPONSES_SHEET);

  if (!sheet) throw new Error('Chybí list RESPONSES.');
  if (!payload || !payload.card_id || !payload.response_id || !payload.data) {
    throw new Error('Neplatná odpověď.');
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(5000);

  try {
    if (responseExists_(sheet, payload.response_id)) {
      return { ok: true, duplicate: true };
    }

    sheet.appendRow([
      new Date(),
      payload.card_id,
      payload.response_id,
      'online',
      JSON.stringify(payload.data)
    ]);

    return { ok: true, duplicate: false };
  } finally {
    lock.releaseLock();
  }
}

function responseExists_(sheet, responseId) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;
  const values = sheet.getRange(2, 3, lastRow - 1, 1).getValues();
  return values.some(row => row[0] === responseId);
}

function getPrototypeCards_() {
  return {
    kompetence: {
      id: 'kompetence',
      title: 'Kompetence v inkluzivním vzdělávání',
      subtitle: 'Popište zkušenost z praxe.',
      fields: [
        { id: 'teacher_view', label: 'Jak situaci vnímáte?', type: 'textarea' },
        { id: 'clarify', label: 'Co byste potřebovali upřesnit?', type: 'textarea' },
        { id: 'assistant_view', label: 'Jak byste situaci vysvětlili kolegovi?', type: 'textarea' }
      ]
    }
  };
}
