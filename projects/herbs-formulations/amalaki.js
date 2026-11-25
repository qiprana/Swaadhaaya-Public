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
  const state = {catalog:null, selectedId:idDried, notes:{}, editing:false, saveTimer:null, research:null, sourceFilter:'all', selectedVerse:'ss-su-46-143'};
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
      const placeholder=document.createElement('div');
      placeholder.className='image-loading-card';
      placeholder.innerHTML='<div class="image-loading-symbol" aria-hidden="true">❧</div><strong>Amalaki · Botanical photograph</strong><span>Source-identified image candidate · CC0</span><a href="'+esc(candidate.source_page||'#')+'" target="_blank" rel="noopener noreferrer">See original photo ↗</a>';
      frame.append(placeholder);
      img.addEventListener('load',()=>{placeholder.hidden=true;});
      img.addEventListener('error',()=>{img.remove();placeholder.querySelector('strong').textContent='Photo is unavailable here';});
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
  const sourceStatus=s=>({root_text_visible:['Text available','text-ready'],root_text_visible_edition_mismatch:['Text · edition check','text-ready'],root_text_located:['Root-text locator','locator'],cross_reference_index:['Indexed reference','index-only'],electronic_witness_needs_review:['Transcription · review','locator'],secondary_lead_only:['Research lead','lead']})[s]||['Research pending','lead'];
  function renderSourceAtlas(){
    const all=state.research?.sources||[];
    const rows=all.filter(x=>state.sourceFilter==='all'||x.group===state.sourceFilter);
    $('#sourceCount').textContent=rows.length+' of '+all.length+' locations';
    $('#sourceGrid').innerHTML=rows.map(s=>{
      const [label,klass]=sourceStatus(s.status);
      const desc=s.description||'';
      return '<article class="source-item '+(s.group==='samhita'?'samhita':'nighantu')+'"><div class="source-item-top"><span class="source-type">'+esc(s.group==='samhita'?'ROOT SAṂHITĀ':'NIGHAṆṬU')+'</span><span class="source-status '+klass+'">'+esc(label)+'</span></div><h3>'+esc(s.work)+'</h3><div class="source-place">'+esc(s.place)+'</div><p>'+esc(desc)+'</p><div class="source-tail"><span>'+esc(s.scope||'source reference')+'</span><a href="'+esc(s.source_url)+'" target="_blank" rel="noopener noreferrer">Inspect text ↗</a></div></article>';
    }).join('')||'<p>No items in this source group yet.</p>';
    document.querySelectorAll('[data-source-filter]').forEach(b=>{const active=b.dataset.sourceFilter===state.sourceFilter;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
  }
  function renderSnapshot(record){
    const original=(record.karma_as_given||'').split('\n')[0];
    const terms=original.split(',').map(x=>x.trim()).filter(Boolean);
    $('#snapshotKarma').innerHTML=terms.map(x=>'<span>'+esc(x)+'</span>').join('');
    $('#snapshotDhatu').innerHTML='<span>Rakta · explicitly mentioned</span><span>All dhātus · general note</span>';
  }
  function renderVerse(record){
    const verses=state.research?.verses||[];
    if(!verses.length){$('#verseSelector').innerHTML='';$('#verseContent').innerHTML='<p>Research ledger unavailable; original verse drafts remain in the private source record.</p>';return;}
    if(!verses.find(v=>v.id===state.selectedVerse))state.selectedVerse=verses[0].id;
    $('#verseSelector').innerHTML=verses.map((v,i)=>'<button type="button" data-verse="'+esc(v.id)+'" class="'+(v.id===state.selectedVerse?'active':'')+'" aria-pressed="'+(v.id===state.selectedVerse?'true':'false')+'"><small>TEXT '+(i+1)+'</small><strong>'+esc(v.work)+'</strong><span>'+esc(v.location)+'</span></button>').join('');
    const verse=verses.find(v=>v.id===state.selectedVerse);
    const lines=(verse.word_by_word||[]).map(row=>'<tr><td lang="sa-Deva">'+esc(row[0])+'</td><td>'+esc(row[1])+'</td><td>'+esc(row[2])+'</td></tr>').join('');
    $('#verseContent').innerHTML=
     '<div class="verse-ref"><div><strong>'+esc(verse.work)+' · '+esc(verse.location)+'</strong><p class="small-note">'+esc(verse.title)+'</p></div><span class="verse-claim">Sanskrit review pending</span></div>'+
     '<div class="verse-script"><div class="verse-label">ORIGINAL DEVANĀGARĪ</div><div class="dev-verse" lang="sa-Deva">'+esc(verse.devanagari)+'</div><div class="script-divider"></div><div class="verse-label">IAST TRANSLITERATION</div><div class="iast-verse">'+esc(verse.iast)+'</div></div>'+
     '<div class="verse-explanation"><strong>Meaning from the śloka · study draft</strong><p>'+esc(verse.translation)+'</p></div>'+
     '<div class="verse-tools"><button type="button" disabled aria-label="No chanting recording available">▷ Listen to chanting · pending</button><small>Verse ID: '+esc(verse.id)+' · audio not recorded</small></div>'+
     '<details class="compact-disclosure"><summary>Explore word by word · '+(verse.word_by_word||[]).length+' terms <span class="disclosure-plus"></span></summary><div class="disclosure-body"><div class="word-table-wrap"><table class="word-table"><thead><tr><th>Original word</th><th>IAST</th><th>Study meaning</th></tr></thead><tbody>'+lines+'</tbody></table></div><p class="small-note">Lexical splitting and glosses are unapproved editorial drafts. Compare them with the original text before study publication.</p></div></details>'+
     '<details class="compact-disclosure"><summary>Source witness &amp; editorial checks <span class="disclosure-plus"></span></summary><div class="disclosure-body"><p>'+esc(verse.editorial_note)+'</p><div class="source-ref-row"><a href="'+esc(verse.source_url)+'" target="_blank" rel="noopener noreferrer">Open exact electronic source ↗</a></div><p><strong>Editorial state:</strong> '+esc(verse.status)+'</p></div></details>';
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
    $('#heroBotanical').innerHTML='Phyllanthus emblica L. <span>· accepted botanical name (Kew); Excel: '+esc(h.botanical?.name_as_given||'Not recorded')+'</span>';
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
    applyLinksAndPhoto(h);renderSnapshot(h);renderSourceAtlas();renderVerse(h);renderNote();
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
    document.querySelectorAll('[data-source-filter]').forEach(button=>button.addEventListener('click',()=>{state.sourceFilter=button.dataset.sourceFilter;renderSourceAtlas();}));
    $('#verseSelector').addEventListener('click',event=>{const b=event.target.closest('[data-verse]');if(!b)return;state.selectedVerse=b.dataset.verse;renderVerse(findHerb(state.selectedId));});

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
    setupEvents();
    try{
      const r=await fetch('data/amalaki-classical.json',{cache:'no-store'});
      if(!r.ok)throw Error('Failed to load classical source ledger');
      const research=await r.json();
      if(research.version!=='amalaki.classical-ledger.v1'||!Array.isArray(research.sources)||!Array.isArray(research.verses))throw Error('Classical ledger version mismatch');
      state.research=research;
    }catch(e){console.warn('Classical source ledger not loaded',e);}
    let cache=null;
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