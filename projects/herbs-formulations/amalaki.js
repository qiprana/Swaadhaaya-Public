(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const safeUrl = value => { try {const u=new URL(value);return u.protocol==='https:' ? u.href : ''; } catch{return '';} };
  const asList = value => Array.isArray(value) ? value.filter(Boolean) : value ? [value] : [];
  const field = value => esc(asList(value).join(', ') || 'Not recorded');
  const sourceNotesLabel = 'Workbook source text (unverified clinical claims)';
  const idDried = 'herb-0010-amalaki-dried';
  const idFresh = 'herb-0011-amalaki-fresh-fruit';
  const state = {catalog:null, selectedId:idDried, notes:{}, editing:false, saveTimer:null};
  const previewKey = new URLSearchParams(location.hash.replace(/^#/, '')).get('key');
  const backUrl = previewKey ? 'index.html#key='+encodeURIComponent(previewKey) : 'index.html';
  for(const selector of ['#backToCatalog','#crumbToCatalog','#backupLink']) $(selector).href=backUrl;

  let dbPromise;
  function database(){
    if(!dbPromise) dbPromise=new Promise((resolve,reject)=>{
      const req=indexedDB.open('swaadhaaya-private-catalog-v1',1);
      req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('kv'))req.result.createObjectStore('kv');};
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error);
    });
    return dbPromise;
  }
  async function get(key){
    const db=await database();return new Promise((resolve,reject)=>{
      const tx=db.transaction('kv','readonly'),req=tx.objectStore('kv').get(key);
      req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
    });
  }
  async function put(key,value){
    const db=await database();return new Promise((resolve,reject)=>{
      const tx=db.transaction('kv','readwrite');tx.objectStore('kv').put(value,key);
      tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);
    });
  }
  function decodeB64Url(text){
    if(!/^[A-Za-z0-9_-]+$/.test(text))throw new Error('The preview key or encrypted file is invalid.');
    const padded=text.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-text.length%4)%4);
    return Uint8Array.from(atob(padded),ch=>ch.charCodeAt(0));
  }
  async function fetchCatalog(key){
    if(!crypto?.subtle||typeof DecompressionStream==='undefined')throw new Error('Modern browser encryption and decompression are required.');
    const response=await fetch('data/herbs-catalog.encrypted.json',{cache:'no-store'});
    if(!response.ok)throw new Error('Could not download the private herb catalog: '+response.status);
    const p=await response.json();
    if(p.format!=='swaadhaaya.encrypted-catalog.v1'||p.algorithm!=='AES-256-GCM'||p.compression!=='gzip'||p.aad!=='Swaadhaaya:herb-catalog:v1'||!Array.isArray(p.chunks))throw new Error('Unknown catalog version.');
    const rawKey=decodeB64Url(key);if(rawKey.length!==32)throw new Error('Preview key must be 256-bit.');
    const imported=await crypto.subtle.importKey('raw',rawKey,'AES-GCM',false,['decrypt']);
    const clear=await crypto.subtle.decrypt({name:'AES-GCM',iv:decodeB64Url(p.nonce),additionalData:new TextEncoder().encode(p.aad),tagLength:128},imported,decodeB64Url(p.chunks.join('')));
    const stream=new Blob([clear]).stream().pipeThrough(new DecompressionStream('gzip'));
    const data=JSON.parse(await new Response(stream).text());
    if(!data||data.schema_version!=='herb-catalog-bundle.v1'||!Array.isArray(data.herbs)||data.herbs.length!==510)throw new Error('Invalid catalog contents.');
    return data;
  }
  function findHerb(id){return state.catalog?.herbs?.find(h=>h.id===id)||null;}
  function applyLinksAndPhoto(record){
    const candidate=record.study?.pictures?.approved?.[0]||record.study?.pictures?.candidates?.[0];
    const frame=$('#photoFrame'),caption=$('#photoCredit');
    frame.replaceChildren();
    if(candidate && safeUrl(candidate.image_url)){
      const img=document.createElement('img');
      img.src=candidate.image_url;
      img.alt='Candidate botanical photograph: '+(candidate.scientific_name||'Amalaki')+(candidate.part?', '+candidate.part:'');
      img.loading='eager';
      img.addEventListener('error',()=>{frame.textContent='Photo unavailable · Open image source below';});
      frame.append(img);
      const status=candidate.status?.startsWith('candidate')?'Candidate · botanical review pending':'Reviewed image';
      caption.innerHTML=esc(status)+' · '+esc(candidate.author||'Photographer unknown')+' · '+esc(candidate.license||'License not confirmed')+(safeUrl(candidate.source_page)?' · <a href="'+esc(candidate.source_page)+'" target="_blank" rel="noopener noreferrer">Photo source ↗</a>':'');
    }else{frame.innerHTML='<div class="photo-placeholder">No licensed botanical photograph yet</div>';caption.textContent='Botanical photo research pending';}
    const links=[];
    for(const ref of record.external_references||[])if(safeUrl(ref.url))links.push({name:ref.title,url:ref.url});
    for(const ref of record.study?.classical_sources||[])if(safeUrl(ref.source_url))links.push({name:ref.work+' — source index',url:ref.source_url});
    const v=record.study?.sloka_records?.[0];
    if(v&&safeUrl(v.source_url))links.push({name:'Classical śloka — source edition',url:v.source_url});
    if(candidate&&safeUrl(candidate.source_page))links.push({name:'Photograph — Wikimedia Commons',url:candidate.source_page});
    $('#sourceLinks').innerHTML=links.map(l=>'<a href="'+esc(l.url)+'" target="_blank" rel="noopener noreferrer">'+esc(l.name)+'</a>').join('')||'<p>No research references yet.</p>';
  }
  function renderVerse(record){
    const verse=record.study?.sloka_records?.[0],locations=record.study?.classical_sources||[];
    if(!verse){$('#verseContent').innerHTML='<p>No classical verse has been transcribed for this record yet.</p>';return;}
    const lines=(verse.word_by_word||[]).map(w=>'<tr><td lang="sa-Deva">'+esc(w.devanagari)+'</td><td>'+esc(w.iast)+'</td><td>'+esc(w.meaning)+'</td></tr>').join('');
    const sources='<div class="source-ref-row">'+[verse.source_url,verse.alternate_transcription_url].filter(safeUrl).map((u,i)=>'<a href="'+esc(u)+'" target="_blank" rel="noopener noreferrer">'+(i===0?'Primary transcription':'Compare alternate witness')+' ↗</a>').join('')+'</div>';
    const other=locations.length?'<div class="source-footnote"><strong>Source-location discrepancy:</strong> '+locations.map(l=>esc(l.work)+' '+esc(l.chapter)+' '+esc(l.verse_numbers)+' ('+esc(l.status)+')').join('; ')+'. The draft verse below is numbered '+esc(verse.verse_number_in_source)+' in its electronic witness. Edition differences need editorial review.</div>':'';
    $('#verseContent').innerHTML=
      '<div class="verse-ref"><div><strong>'+esc(verse.work)+' · '+esc(verse.section)+' · verse '+esc(verse.verse_number_in_source)+'</strong><p class="small-note">'+esc(verse.title||'')+'</p></div><span class="verse-claim">Sanskrit review pending</span></div>'+
      '<div class="verse-script"><div class="verse-label">DEVANĀGARĪ</div><div class="dev-verse" lang="sa-Deva">'+esc(verse.devanagari)+'</div><div class="script-divider"></div><div class="verse-label">IAST TRANSLITERATION</div><div class="iast-verse">'+esc(verse.iast)+'</div></div>'+
      '<div class="verse-explanation"><strong>Study meaning · editorial draft</strong>'+esc(verse.meaning_editorial||'Meaning to be reviewed')+'</div>'+
      '<div class="verse-tools"><button type="button" disabled aria-label="Chanting not recorded">▶ Chanting · coming later</button><small>No recording uploaded for this śloka</small></div>'+
      '<details class="compact-disclosure"><summary>Word-by-word meaning · '+(verse.word_by_word||[]).length+' terms <span class="disclosure-plus"></span></summary><div class="disclosure-body"><table class="word-table"><thead><tr><th scope="col">Word</th><th scope="col">IAST</th><th scope="col">Draft meaning</th></tr></thead><tbody>'+lines+'</tbody></table><p class="small-note">Word segmentation and glosses are editorial drafts, not final Sanskrit scholarship.</p></div></details>'+
      '<details class="compact-disclosure"><summary>Source editions, transliteration and review status <span class="disclosure-plus"></span></summary><div class="disclosure-body"><p>'+esc(verse.edition_note||'')+'</p>'+sources+'<p><strong>Current status:</strong> '+esc(verse.editorial_status||'unreviewed')+'</p></div></details>'+other;
  }
  function renderRecord(){
    const h=findHerb(state.selectedId);if(!h){showError('Could not find the selected Amalaki record.');return;}
    const properties=h.ayurvedic_properties||{};
    $('#pageContent').hidden=false;$('#pageStatus').hidden=true;
    $('#variantMeta').textContent=h.source?.sheet+' · row '+h.source?.excel_row+' · '+h.name.source;
    for(const button of document.querySelectorAll('[data-variant]')){
      const active=button.dataset.variant===h.id;
      button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));
    }
    $('#heroBotanical').innerHTML=esc(h.botanical?.name_as_given||'Botanical identity not verified')+' <span>— as recorded in Excel</span>';
    $('#rasaCards').innerHTML=[['Rasa',properties.rasa],['Guṇa',properties.guna],['Vīrya',properties.virya],['Vipāka',properties.vipaka]].map(([label,value])=>'<div class="attr-card"><span class="attr-label">'+label+'</span><span class="attr-value">'+field(value)+'</span></div>').join('');
    $('#doshaText').textContent=h.dosha_as_given||'Not recorded';
    $('#partText').textContent=h.parts?.used_as_given||'Not recorded';
    $('#identityDetails').innerHTML='<dl><dt>Botanical name</dt><dd>'+esc(h.botanical?.name_as_given||'Not recorded')+'</dd><dt>Original description</dt><dd>'+esc(h.description_as_given||'Not recorded')+'</dd><dt>Constituents</dt><dd>'+esc(h.constituents_as_given||'Not recorded')+'</dd><dt>Dose as written</dt><dd>'+esc(h.dose_as_given||'Not recorded')+'<br><small>Historical workbook text; not a dosage recommendation.</small></dd></dl>';
    const actions=h.study?.actions||{};
    const originalFirstLine=(actions.karma_original||h.karma_as_given||'').split('\n')[0];
    const majorTerms=originalFirstLine.split(',').map(s=>s.trim()).filter(Boolean);
    $('#karmaTags').innerHTML=majorTerms.map(t=>'<span class="term-chip">'+esc(t)+'</span>').join('');
    $('#therapyTags').innerHTML=(actions.therapeutic_terms_searchable||h.therapeutic_uses_as_given?.split(/[,;]/).map(x=>x.trim())||[]).filter(Boolean).map(t=>'<span class="term-chip">'+esc(t)+'</span>').join('');
    $('#karmaOriginal').textContent=h.karma_as_given||'Not recorded';
    $('#therapyOriginal').textContent=h.therapeutic_uses_as_given||'Not recorded';
    $('#categoryAccordion').innerHTML=(h.category_sections||[]).map((s,i)=>'<details'+(i===0?' open':'')+'><summary>'+esc(s.label)+'</summary><p>'+esc(s.description)+'</p></details>').join('');
    $('#formulaList').innerHTML=(h.formulation_mentions||[]).map(n=>'<a href="index.html?formulation='+encodeURIComponent(n)+(previewKey?'#key='+encodeURIComponent(previewKey):'')+'">'+esc(n)+' ↗</a>').join('')||'<p>No formulation mentions for this preparation.</p>';
    $('#asideBotanical').textContent=h.botanical?.name_as_given||'Not recorded';
    $('#asideWorkbook').textContent=(h.source?.sheet||'Workbook')+' · row '+(h.source?.excel_row||'—');
    $('#asidePart').textContent=h.parts?.used_as_given||'Not recorded';
    $('#asideConstituents').textContent=h.constituents_as_given||'Not recorded';
    applyLinksAndPhoto(h);renderVerse(h);renderNote();
  }
  function renderNote(){
    const record=state.notes[state.selectedId];
    $('#notesText').value=record?.text||'';
    $('#notesText').disabled=!state.editing;
    $('#noteMode').textContent=state.editing?'Edit mode':'Read mode';
    $('#toggleEdit').textContent=state.editing?'Close Edit Mode':'Enable Edit Mode';
    $('#noteSaveStatus').textContent=state.editing?'Changes autosave on this device':'Read mode · Notes saved locally';
  }
  async function saveNote(){
    if(!state.editing)return;
    state.notes[state.selectedId]={text:$('#notesText').value,updated_at:new Date().toISOString()};
    $('#noteSaveStatus').textContent='Saving locally…';
    await put('notes',state.notes);
    $('#noteSaveStatus').textContent='Saved on this device · Backup recommended';
  }
  async function finishPendingNote(){
    if(state.saveTimer){clearTimeout(state.saveTimer);state.saveTimer=null;}
    if(state.editing)await saveNote();
  }
  function showError(text){
    $('#pageStatus').hidden=false;
    $('#pageStatus').innerHTML='<div class="error-body"><strong>Amalaki study page could not load</strong><span>'+esc(text)+'</span><span>Open your private Herbs preview link once, then return to this page. All private source records remain in the original catalog.</span><a href="'+esc(backUrl)+'">Open Herbs &amp; Formulations</a></div>';
  }
  function setupEvents(){
    document.querySelectorAll('[data-variant]').forEach(button=>button.addEventListener('click',async()=>{
      try{await finishPendingNote();state.selectedId=button.dataset.variant;renderRecord();}catch(e){$('#noteSaveStatus').textContent='Saving failed: '+e.message;}
    }));
    $('#toggleEdit').addEventListener('click',async()=>{
      if(state.editing){try{await finishPendingNote();}catch(e){alert('Local note save failed: '+e.message);return;}}
      state.editing=!state.editing;renderNote();
      if(!state.editing&&confirm('Edit Mode closed. Open your encrypted notes-backup controls?'))location.href=backUrl;
    });
    $('#notesText').addEventListener('input',()=>{
      if(!state.editing)return;
      $('#noteSaveStatus').textContent='Unsaved changes…';
      clearTimeout(state.saveTimer);
      state.saveTimer=setTimeout(()=>{saveNote().catch(e=>$('#noteSaveStatus').textContent='Save failed: '+e.message);},320);
    });
  }
  async function init(){
    setupEvents();let cache=null;
    try{
      state.notes=await get('notes')||{};
      cache=await get('catalog');
      if(cache?.herbs?.find(h=>h.id===idDried)?.study?.sloka_records?.length){
        state.catalog=cache;renderRecord();
      }
    }catch(e){console.warn('Local catalog cache unavailable',e);}
    if(previewKey){
      try{
        const fresh=await fetchCatalog(previewKey);
        if(!fresh.herbs.find(h=>h.id===idDried)?.study?.sloka_records?.length)throw new Error('The published catalog needs to be updated to study format v0.2.');
        state.catalog=fresh;
        renderRecord();
        try{await put('catalog',fresh);}catch(e){console.warn('Could not cache catalog',e);}
      }catch(e){if(!state.catalog)showError(e.message);else console.warn('Cannot refresh catalog',e);}
    }else if(!state.catalog){showError('No detailed Amalaki source data is available in this browser.');}
  }
  init();
})();