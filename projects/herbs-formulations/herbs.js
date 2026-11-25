(() => {
"use strict";
const $ = (s,root=document) => root.querySelector(s);
const $$ = (s,root=document) => [...root.querySelectorAll(s)];
const esc = (x) => String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const norm = (x) => String(x??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
const pretty = (v) => Array.isArray(v)?v.filter(Boolean).join(", "):String(v??"");
const state = {catalog:null, tab:"herbs", kind:"all", query:"", selected:null, limit:48, edit:false,notes:{}, index:[], herbMap:new Map(),formMap:new Map(),timer:null};
let dbReady;
function database(){ if(dbReady)return dbReady; dbReady=new Promise((resolve,reject)=>{const r=indexedDB.open("swaadhaaya-private-catalog-v1",1);r.onupgradeneeded=()=>r.result.createObjectStore("kv");r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});return dbReady;}
async function get(key){const db=await database();return new Promise((resolve,reject)=>{const t=db.transaction("kv","readonly");const r=t.objectStore("kv").get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function put(key,value){const db=await database();return new Promise((resolve,reject)=>{const t=db.transaction("kv","readwrite");t.objectStore("kv").put(value,key);t.oncomplete=()=>resolve();t.onerror=()=>reject(t.error);});}
async function remove(key){const db=await database();return new Promise((resolve,reject)=>{const t=db.transaction("kv","readwrite");t.objectStore("kv").delete(key);t.oncomplete=()=>resolve();t.onerror=()=>reject(t.error);});}
function validate(c){return c&&c.schema_version==="herb-catalog-bundle.v1"&&Array.isArray(c.herbs)&&c.herbs.every(x=>x.id&&x.name&&x.source)&&Array.isArray(c.formulation_references);}
function message(text){$("#backupStatus").textContent=text;}
function initCatalog(c){
 if(!validate(c))throw new Error("Invalid Swaadhaaya catalog format.");
 state.catalog=c;state.herbMap=new Map(c.herbs.map(r=>[r.id,r]));
 state.formMap=new Map(c.formulation_references.map(r=>[r.id,r]));
 state.index=c.herbs.map(r=>({
   id:r.id, text:norm([r.name.source,r.name.display,r.name.base_name,(r.name.english||[]).join(" "),(r.name.synonyms||[]).join(" "),r.botanical?.name_as_given,r.parts?.used_as_given,r.karma_as_given,r.therapeutic_uses_as_given,r.description_as_given,r.dosha_as_given,r.category_sections?.map(s=>s.description).join(" "),(r.formulation_mentions||[]).join(" "),r.ayurvedic_properties?.rasa?.join(" "),r.ayurvedic_properties?.guna?.join(" ")].join(" "))
 }));
 $("#catalogStatus").textContent="Private catalog loaded";$("#catalogSub").textContent=c.herbs.length+" source records available on this device. Nothing was uploaded to GitHub.";
 $("#countAll").textContent=c.herbs.length;$("#countFormula").textContent=c.formulation_references.length;$("#countVariants").textContent=c.herbs.filter(h=>h.related_variants?.length).length;
 $("#stats").hidden=false;$("#browser").hidden=false;$("#forgetCatalog").disabled=false;$("#modeButton").disabled=false;
 state.selected={type:"herb",id:c.herbs[0]?.id}; render();
}
function setTab(tab){state.tab=tab;state.kind="all";state.limit=48;$$("[data-tab]").forEach(b=>b.classList.toggle("selected",b.dataset.tab===tab));$$("[data-kind]").forEach(b=>b.classList.toggle("selected",b.dataset.kind==="all"));$("#kindFilters").hidden=tab!=="herbs";state.selected=null;render();}
function select(type,id){
 if(type==="herb"&&!state.herbMap.has(id))return;
 if(type==="form"&&!state.formMap.has(id))return;
 state.selected={type,id};state.tab=type==="herb"?"herbs":"formulations";
 $$("[data-tab]").forEach(b=>b.classList.toggle("selected",b.dataset.tab===state.tab));
 $("#kindFilters").hidden=state.tab!=="herbs";render();
 $("#detailPanel").scrollIntoView({block:"nearest",behavior:"smooth"});
}
function render(){
 if(!state.catalog)return;
 const q=norm(state.query.trim()).split(/\s+/).filter(Boolean);
 let rows;
 if(state.tab==="herbs"){
   rows=state.catalog.herbs.filter((h,i)=>(state.kind==="all"||h.kind===state.kind)&&q.every(w=>state.index[i].text.includes(w)));
 } else {
   rows=state.catalog.formulation_references.filter(f=>q.every(w=>norm(f.name+" "+f.herb_ids.map(id=>state.herbMap.get(id)?.name?.display||"").join(" ")).includes(w)));
 }
 $("#resultCount").textContent=rows.length.toLocaleString()+" "+(state.tab==="herbs"?"herb records":"formulation-name references");
 const displayed=rows.slice(0,state.limit);
 $("#itemList").innerHTML=displayed.length?displayed.map(r=>{
   if(state.tab==="herbs")return '<button type="button" class="item'+(state.selected?.id===r.id?" active":"")+'" data-herb-id="'+esc(r.id)+'"><strong>'+esc(r.name.display)+(r.name.variant?' · '+esc(r.name.variant):"")+'</strong><small>'+esc(r.botanical?.name_as_given||pretty(r.name.english)||"Botanical name not in source")+'</small><span class="tag">'+esc(r.kind==="ayurvedic_herb"?"Ayurvedic record":r.kind==="spice"?"Spice":"Western herb")+'</span></button>';
   return '<button type="button" class="item'+(state.selected?.id===r.id?" active":"")+'" data-form-id="'+esc(r.id)+'"><strong>'+esc(r.name)+'</strong><small>'+r.count+' workbook herb reference(s) · Unverified</small></button>';
 }).join(""):'<div class="empty">No matching records. Try a botanical name, Sanskrit name, or another keyword.</div>';
 $("#moreButton").hidden=rows.length<=state.limit;
 renderDetails();
}
function block(title,text){return text?'<section class="detail-section"><h3>'+esc(title)+'</h3><p class="source-field">'+esc(text)+'</p></section>':"";}
function chipList(items){return '<div class="chips">'+items.filter(Boolean).map(t=>'<span class="chip">'+esc(t)+'</span>').join("")+'</div>';}
function formLinks(names){
 return '<div class="form-links">'+(names||[]).map(n=>{
  const id="formulation-ref-"+n.normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,85);
  return '<button type="button" data-form-id="'+esc(id)+'">'+esc(n)+'</button>';
 }).join("")+'</div>';
}
function renderDetails(){
 const panel=$("#detailPanel");
 if(!state.selected){panel.innerHTML='<div class="empty">Select a '+(state.tab==="herbs"?"herb":"formulation reference")+' from the list to study its details.</div>';return;}
 if(state.selected.type==="form"){
  const f=state.formMap.get(state.selected.id);if(!f)return;
  panel.innerHTML='<div class="detail-head"><div><span class="eyebrow">Formulation name index</span><h2>'+esc(f.name)+'</h2><p class="detail-sub">Source workbook references · Requires editorial verification</p></div></div>'+
   '<section class="detail-section"><div class="notice"><strong>Not a verified formulation recipe.</strong> These herb records mention this formulation name in the spreadsheet. Actual ingredients, amounts, preparation, and source ślokas must be independently verified.</div></section>'+
   '<section class="detail-section"><h3>Referenced by '+f.count+' herb record(s)</h3><div class="form-links">'+(f.herb_ids||[]).map(id=>{const h=state.herbMap.get(id);return h?'<button type="button" data-herb-id="'+esc(id)+'">'+esc(h.name.display)+(h.name.variant?" · "+esc(h.name.variant):"")+'</button>':"";}).join("")+'</div></section>'+
   '<section class="detail-section"><h3>Future formulation profile</h3><p>Verified recipe, ingredient links, proportions, classical citations, audio, images, and personal annotations.</p></section>';return;
 }
 const h=state.herbMap.get(state.selected.id);if(!h)return;
 const a=h.ayurvedic_properties||{};
 const props=["rasa","guna","virya","vipaka"].map(k=>'<div class="property"><b>'+k[0].toUpperCase()+k.slice(1)+'</b><span>'+esc(pretty(a[k])||"Not specified")+'</span></div>').join("");
 const sib=(h.related_variants||[]).map(id=>{const v=state.herbMap.get(id);return v?'<button data-herb-id="'+esc(id)+'" type="button">'+esc(v.name.source)+'</button>':"";}).join("");
 const ext=(h.external_references||[]).filter(x=>/^https:\/\//.test(x.url)).map(x=>'<a class="external-link" target="_blank" rel="noopener noreferrer" href="'+esc(x.url)+'">'+esc(x.title)+' ↗ (not imported)</a>').join("");
 const note=state.notes[h.id]?.text||"";
 panel.innerHTML='<div class="detail-head"><div><span class="eyebrow">'+esc(h.kind==="ayurvedic_herb"?"Ayurvedic herb":h.kind==="spice"?"Spice":"Western herb")+'</span><h2>'+esc(h.name.display)+'</h2><p class="detail-sub">'+esc(h.name.source)+(h.botanical.name_as_given?'<br><i>'+esc(h.botanical.name_as_given)+'</i>':"")+'</p></div><span class="detail-kind">'+esc(h.name.variant||h.parts.used_as_given||"Herb")+'</span></div>'+
 '<section class="detail-section"><div class="media-boxes"><div class="image-placeholder">🌿 Botanical photograph · Pending verified image and license</div><div class="image-placeholder">🔊 Sanskrit audio · Not recorded yet</div></div></section>'+
 '<section class="detail-section"><h3>Identification</h3>'+chipList([...(h.name.english||[]),...(h.name.synonyms||[])])+ (h.parts.used_as_given?'<p><strong>Part used:</strong> '+esc(h.parts.used_as_given)+'</p>':"")+(sib?'<p><strong>Other entries / parts:</strong></p><div class="form-links">'+sib+'</div>':"")+'</section>'+
 (h.kind==="ayurvedic_herb"?'<section class="detail-section"><h3>Ayurvedic properties</h3><div class="property-grid">'+props+'</div></section>':"")+
 block("Doṣa and Dīpana (source text)",h.dosha_as_given)+block(h.kind==="western"?"Western herbal actions (source text)":"Karma / Actions (source text)",h.karma_as_given)+
 block(h.kind==="western"?"Traditional/common uses (source text)":"Therapeutic uses (source text)",h.therapeutic_uses_as_given)+block("Description (source text)",h.description_as_given)+
 (h.category_sections?.length?'<section class="detail-section"><h3>System categories from source</h3>'+h.category_sections.map(s=>'<p><strong>'+esc(s.label)+':</strong> '+esc(s.description)+'</p>').join("")+'</section>':"")+
 block("Constituents (source text)",h.constituents_as_given)+block("Dose recorded in workbook — not medical advice",h.dose_as_given)+
 (h.formulation_mentions?.length?'<section class="detail-section"><h3>Formulation references</h3><p class="fineprint">Names appearing in this herb’s workbook row, not verified ingredient assignments.</p>'+formLinks(h.formulation_mentions)+'</section>':"")+
 '<section class="detail-section"><h3>Ślokas and verified references</h3><p class="fineprint">No śloka or recitation has been added yet. Future entries will include exact text, chapter, verse, source edition, and audio.</p>'+ext+'</section>'+
 '<section class="detail-section"><h3>My private notes</h3><p class="fineprint">These notes save in this browser only. Enable Edit Mode to write, and export an encrypted backup for another device.</p><textarea id="noteText" '+(state.edit?"":"disabled")+' placeholder="Study observations, references, class notes...">'+esc(note)+'</textarea><p id="noteStatus" class="fineprint">'+(state.edit?"Edit Mode · Autosaves locally":"Read Mode · Viewing only")+'</p></section>'+
 '<p class="fineprint">Source: '+esc(h.source.file)+' · '+esc(h.source.sheet)+' · Excel row '+esc(h.source.excel_row)+'. Original imported material is not independently verified. Medical claims are preserved as source quotations for study.</p>';
}
async function saveNote(){const id=state.selected?.type==="herb"?state.selected.id:null;if(!id||!state.edit)return;const field=$("#noteText");if(!field)return;state.notes[id]={text:field.value,updated_at:new Date().toISOString()};await put("notes",state.notes);$("#noteStatus").textContent="Saved locally · Backup recommended";}
async function exportNotes(){
 const pw=prompt("Choose a strong backup passphrase (at least 12 characters). Keep it safe; it cannot be recovered.");if(pw===null)return;
 if(pw.length<12){alert("Use at least 12 characters.");return;}
 const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
 const material=await crypto.subtle.importKey("raw",new TextEncoder().encode(pw),"PBKDF2",false,["deriveKey"]);
 const key=await crypto.subtle.deriveKey({name:"PBKDF2",salt,iterations:310000,hash:"SHA-256"},material,{name:"AES-GCM",length:256},false,["encrypt"]);
 const raw=new TextEncoder().encode(JSON.stringify({format:"swaadhaaya-herb-notes.v1",notes:state.notes,exported_at:new Date().toISOString()}));
 const encrypted=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv},key,raw));
 const b64=x=>btoa(String.fromCharCode(...x));
 const file={format:"swaadhaaya-encrypted-notes.v1",algorithm:"AES-256-GCM",kdf:"PBKDF2-SHA256",iterations:310000,salt:b64(salt),iv:b64(iv),ciphertext:b64(encrypted)};
 const blob=new Blob([JSON.stringify(file,null,2)],{type:"application/json"});
 const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="swaadhaaya-herbs-notes-"+new Date().toISOString().slice(0,10)+".encrypted.json";a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
 message("Encrypted notes backup prepared for download. Verify it is saved to your device.");
}
async function importNotes(file){
 const data=JSON.parse(await file.text());if(data.format!=="swaadhaaya-encrypted-notes.v1")throw Error("Not a Swaadhaaya encrypted notes backup.");
 const pw=prompt("Enter the passphrase used to encrypt this backup.");if(pw===null)return;
 const from64=s=>Uint8Array.from(atob(s),x=>x.charCodeAt(0));
 const m=await crypto.subtle.importKey("raw",new TextEncoder().encode(pw),"PBKDF2",false,["deriveKey"]);
 const key=await crypto.subtle.deriveKey({name:"PBKDF2",salt:from64(data.salt),iterations:data.iterations,hash:"SHA-256"},m,{name:"AES-GCM",length:256},false,["decrypt"]);
 const plain=await crypto.subtle.decrypt({name:"AES-GCM",iv:from64(data.iv)},key,from64(data.ciphertext));
 const payload=JSON.parse(new TextDecoder().decode(plain));if(payload.format!=="swaadhaaya-herb-notes.v1"||!payload.notes||typeof payload.notes!=="object")throw Error("Backup format invalid.");
 for(const [id,n] of Object.entries(payload.notes)){if(typeof n.text!=="string"||!n.updated_at)continue;if(!state.notes[id]||n.updated_at>state.notes[id].updated_at)state.notes[id]=n;}
 await put("notes",state.notes);message("Encrypted backup imported and notes merged. Conflicts with identical timestamps were not overwritten.");renderDetails();
}
function events(){
 $("#catalogFile").addEventListener("change",async e=>{const file=e.target.files[0];if(!file)return;try{const c=JSON.parse(await file.text());if(!validate(c))throw Error("Use the generated catalog-bundle.json, not a single herb record.");initCatalog(c);await put("catalog",c);}catch(err){alert("Could not import catalog: "+err.message);}e.target.value="";});
 $("#forgetCatalog").addEventListener("click",async()=>{if(!confirm("Remove the private catalog from this browser? Personal notes will be kept separately."))return;await remove("catalog");state.catalog=null;state.herbMap.clear();state.formMap.clear();$("#browser").hidden=true;$("#stats").hidden=true;$("#modeButton").disabled=true;$("#forgetCatalog").disabled=true;$("#catalogStatus").textContent="No private catalog loaded";$("#catalogSub").textContent="Choose catalog-bundle.json to browse."});
 $$("[data-tab]").forEach(b=>b.addEventListener("click",()=>setTab(b.dataset.tab)));
 $$("[data-kind]").forEach(b=>b.addEventListener("click",()=>{state.kind=b.dataset.kind;state.limit=48;$$("[data-kind]").forEach(x=>x.classList.toggle("selected",x===b));render();}));
 $("#searchTerm").addEventListener("input",e=>{state.query=e.target.value;state.limit=48;render();});
 $("#itemList").addEventListener("click",e=>{const b=e.target.closest("[data-herb-id],[data-form-id]");if(!b)return;select(b.dataset.herbId?"herb":"form",b.dataset.herbId||b.dataset.formId);});
 $("#detailPanel").addEventListener("click",e=>{const b=e.target.closest("[data-herb-id],[data-form-id]");if(b)select(b.dataset.herbId?"herb":"form",b.dataset.herbId||b.dataset.formId);});
 $("#detailPanel").addEventListener("input",e=>{if(e.target.id==="noteText"&&state.edit){clearTimeout(state.timer);state.timer=setTimeout(()=>saveNote().catch(err=>message("Local save failed: "+err.message)),350);}});
 $("#moreButton").addEventListener("click",()=>{state.limit+=48;render();});
 $("#modeButton").addEventListener("click",async()=>{if(state.edit){clearTimeout(state.timer);await saveNote();state.edit=false;$("#modeButton").textContent="Enable editing";$("#modeLabel").textContent="Read mode";renderDetails();if(confirm("Edit Mode closed. Export an encrypted backup of your notes now?"))exportNotes().catch(e=>alert(e.message));}else{state.edit=true;$("#modeButton").textContent="Close editing";$("#modeLabel").textContent="Edit mode";renderDetails();}});
 $("#exportNotes").addEventListener("click",()=>exportNotes().catch(e=>alert("Backup failed: "+e.message)));
 $("#importNotes").addEventListener("change",async e=>{const file=e.target.files[0];if(!file)return;try{await importNotes(file);}catch(err){alert("Import failed. Check file and passphrase: "+err.message);}e.target.value="";});
}
async function init(){events();try{state.notes=await get("notes")||{};const c=await get("catalog");if(c)initCatalog(c);}catch(e){message("Browser storage unavailable: "+e.message);} }
init();
})();