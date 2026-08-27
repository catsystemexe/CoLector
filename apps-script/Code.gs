const SPREADSHEET_ID = '1YWlpsu_LbDOVtf4dE6f0iqzJYyasfhJ4-gCWZVib0sk';
const RESPONSES_SHEET = 'RESPONSES';
const FORMS_SHEET = 'FORMS';
const FORMS_HEADERS = [
  'form_id',
  'internal_title',
  'public_title',
  'schema_json',
  'status',
  'created_at',
  'updated_at'
];

function doGet(e) {
  const params = (e && e.parameter) || {};
  const view = params.view || '';

  if (view === 'editor') return renderEditor_();
  if (view === 'forms') return renderTemplatePage_('Forms', 'CoLector — Moje formuláře');
  if (view === 'data') return renderTemplatePage_('Data', 'CoLector — Data a výsledky');
  if (view === 'home' || (!view && !params.card)) return renderTemplatePage_('Home', 'CoLector — Home');

  const cardId = params.card || 'kompetence';
  const cards = getPrototypeCards_();
  const card = cards[cardId] || cards.kompetence;
  const template = HtmlService.createTemplateFromFile('Index');
  template.card = card;

  return template.evaluate().setTitle('CoLector')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function renderTemplatePage_(fileName, title) {
  const template = HtmlService.createTemplateFromFile(fileName);
  template.appUrl = ScriptApp.getService().getUrl();
  return template.evaluate().setTitle(title)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function renderEditor_() {
  const baseHtml = HtmlService.createHtmlOutputFromFile('Admin').getContent();
  const html = baseHtml.replace('</body>', getEditorRouteBootstrap_() + '\n</body>');
  return HtmlService.createHtmlOutput(html).setTitle('CoLector — Editor formuláře')
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

  const homeBrand=document.querySelector('.brand-wrap');
  if(homeBrand){
    homeBrand.style.cursor='pointer';homeBrand.setAttribute('role','link');homeBrand.setAttribute('tabindex','0');homeBrand.setAttribute('aria-label','Přejít na Home');
    homeBrand.addEventListener('click',goHome);
    homeBrand.addEventListener('keydown',function(event){if(event.key==='Enter'||event.key===' '){event.preventDefault();goHome()}});
  }

  const extraStyle=document.createElement('style');
  extraStyle.textContent='.editor-reset{position:absolute;top:14px;right:16px;z-index:5;width:36px;height:36px;border:0;border-radius:10px;background:transparent;color:#7a8498;display:grid;place-items:center}.editor-reset:hover{background:#f2f4f9;color:#4e5b72}.editor-reset svg{width:20px;height:20px;stroke:currentColor;fill:none;stroke-width:1.8}.header-btn.delete-form:hover{background:#fff0f1;color:#c54c56}@media(max-width:760px){.editor-reset{top:10px;right:10px}}';
  document.head.appendChild(extraStyle);

  const headerActions=document.querySelector('.header-actions');
  if(headerActions){
    const qrButton=Array.from(headerActions.querySelectorAll('.header-btn')).find(function(button){return button.textContent.trim()==='QR'});
    if(qrButton){
      qrButton.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM15 14h2v2h-2zM19 14h2v4h-2zM14 19h4v2h-4zM20 20h1v1h-1z"/></svg><span>QR</span>';
      headerActions.insertBefore(qrButton,headerActions.firstChild);
    }
    const deleteButton=document.createElement('button');
    deleteButton.className='header-btn delete-form';deleteButton.type='button';deleteButton.title='Smazat formulář';deleteButton.setAttribute('aria-label','Smazat formulář');
    deleteButton.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6"/></svg><span>Smazat</span>';
    deleteButton.addEventListener('click',function(){
      if(!confirm('Opravdu smazat tento formulář?'))return;
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
      if(!confirm('Opravdu vymazat celý obsah formuláře?'))return;
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

  google.script.url.getLocation(function(location){
    const params=(location&&location.parameter)||{};
    if(params.new==='1'){applyEditorSchema(createBlankSchema());return}
    if(params.form){
      setSaveStatus('Načítám…','saving','Načítám formulář');
      google.script.run.withSuccessHandler(function(result){if(!result||!result.schema){setSaveStatus('Nenalezeno','error','Formulář nebyl nalezen');return}applyEditorSchema(result.schema)}).withFailureHandler(function(error){const message=error&&error.message?error.message:'Formulář se nepodařilo načíst';setSaveStatus('Chyba','error',message)}).getFormDraft(params.form);
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
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = getOrCreateFormsSheet_(spreadsheet);
  const lock = LockService.getScriptLock();lock.waitLock(10000);
  try {
    const now = new Date();
    const rowIndex = findFormRow_(sheet, payload.formId);
    const row = [payload.formId,String(schema.internalTitle || ''),String(schema.title || ''),JSON.stringify(schema),'draft',rowIndex ? sheet.getRange(rowIndex, 6).getValue() || now : now,now];
    if (rowIndex) sheet.getRange(rowIndex, 1, 1, row.length).setValues([row]); else sheet.appendRow(row);
    return {ok:true,formId:payload.formId,updatedAt:now.toISOString()};
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
  return {formId:values[0],internalTitle:values[1],title:values[2],schema,status:values[4],createdAt:values[5] instanceof Date ? values[5].toISOString() : values[5],updatedAt:values[6] instanceof Date ? values[6].toISOString() : values[6]};
}

function listFormDrafts() {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = getOrCreateFormsSheet_(spreadsheet);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, FORMS_HEADERS.length).getValues().filter(row => row[0]).map(row => ({formId:row[0],internalTitle:row[1],title:row[2],status:row[4],createdAt:row[5] instanceof Date ? row[5].toISOString() : row[5],updatedAt:row[6] instanceof Date ? row[6].toISOString() : row[6]})).sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

function getOrCreateFormsSheet_(spreadsheet) {
  let sheet = spreadsheet.getSheetByName(FORMS_SHEET);
  if (!sheet) {sheet=spreadsheet.insertSheet(FORMS_SHEET);sheet.getRange(1,1,1,FORMS_HEADERS.length).setValues([FORMS_HEADERS]);sheet.setFrozenRows(1);} else {
    const currentHeaders=sheet.getRange(1,1,1,FORMS_HEADERS.length).getValues()[0];
    const mismatch=FORMS_HEADERS.some((header,index)=>currentHeaders[index]!==header);
    if(mismatch&&sheet.getLastRow()<=1){sheet.getRange(1,1,1,FORMS_HEADERS.length).setValues([FORMS_HEADERS]);sheet.setFrozenRows(1);}
  }
  return sheet;
}

function findFormRow_(sheet, formId) {
  const lastRow=sheet.getLastRow();if(lastRow<2)return 0;
  const ids=sheet.getRange(2,1,lastRow-1,1).getValues().flat();const index=ids.indexOf(formId);return index===-1?0:index+2;
}

function submitResponse(payload) {
  if (!payload || !payload.cardId || !payload.responseId || !payload.answers) throw new Error('Neplatná odpověď.');
  const spreadsheet=SpreadsheetApp.openById(SPREADSHEET_ID);const sheet=spreadsheet.getSheetByName(RESPONSES_SHEET);if(!sheet)throw new Error('List RESPONSES nebyl nalezen.');
  const lock=LockService.getScriptLock();lock.waitLock(10000);
  try {
    const lastRow=sheet.getLastRow();if(lastRow>1){const existingIds=sheet.getRange(2,3,lastRow-1,1).getValues().flat();if(existingIds.includes(payload.responseId))return{ok:true,duplicate:true};}
    sheet.appendRow([new Date(),payload.cardId,payload.responseId,'online',JSON.stringify(payload.answers)]);return{ok:true,duplicate:false};
  } finally {lock.releaseLock();}
}

function getPrototypeCards_() {
  return {kompetence:{id:'kompetence',title:'Kompetence',instructions:'Sepište stručně pohled skupiny.',fields:[{id:'teacher_view',type:'textarea',label:'Pohled učitele'},{id:'assistant_view',type:'textarea',label:'Pohled asistenta'},{id:'clarify',type:'textarea',label:'Co je potřeba vyjasnit?'}]}};
}
