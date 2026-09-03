import { parseSmsPdf, parseSireWorkbook } from './browser/parsers.js';
import { normalizeSireRows } from './core/excel-schema.js';
import { mapSireItem, challengeMapping, rankResults, buildPageIndex } from './core/mapper.js';
import { applyDecision, toCsv, AUDITOR_DECISIONS } from './core/export.js';

const $=id=>document.getElementById(id);
const state={sms:null,sire:null,indexedPages:[],sireItems:[],results:[],selectedId:null,pdfUrl:null,analysisName:'',mappingDirty:false};
const ROLES=[['reference','Reference / Question ID'],['section','Section / Topic'],['question','Question / Requirement'],['guidance','Guidance / Expected Evidence'],['rank','Rank / Role'],['applicability','Applicability / Vessel Type'],['risk','Risk / Category']];
const VISIBLE_LIMIT=300;

function esc(v=''){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function toast(message,ms=3200){const el=$('toast');el.textContent=message;el.classList.remove('hidden');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.add('hidden'),ms);}
function setStatus(id,{kind='idle',title,detail}){const el=$(id);el.innerHTML=`<span class="status-dot ${esc(kind)}"></span><div><b>${esc(title)}</b><small>${esc(detail||'')}</small></div>`;}
function setProgress(percent){$('smsProgress').classList.remove('hidden');$('smsProgressBar').style.width=`${Math.max(0,Math.min(100,percent))}%`;}
function finishProgress(){setTimeout(()=>$('smsProgress').classList.add('hidden'),350);}

$('smsFile').addEventListener('change',handleSmsUpload);
$('sireFile').addEventListener('change',handleSireUpload);
$('runAnalysis').addEventListener('click',runAnalysis);
$('exportCsv').addEventListener('click',exportCsv);
$('clearAnalysis').addEventListener('click',clearAnalysis);
$('resultSearch').addEventListener('input',renderResultList);
$('coverageFilter').addEventListener('change',renderResultList);
$('priorityFilter').addEventListener('change',renderResultList);
$('decisionFilter').addEventListener('change',renderResultList);

async function handleSmsUpload(event){
  const file=event.target.files?.[0];if(!file)return;
  if(state.pdfUrl)URL.revokeObjectURL(state.pdfUrl);
  state.pdfUrl=URL.createObjectURL(file);
  setStatus('smsStatus',{kind:'loading',title:'Reading SMS PDF…',detail:file.name});setProgress(1);
  try{
    const sms=await parseSmsPdf(file,p=>{setProgress(p.percent);setStatus('smsStatus',{kind:'loading',title:`Reading SMS PDF… ${p.percent}%`,detail:`Page ${p.current} of ${p.total}`});});
    state.sms=sms;state.indexedPages=buildPageIndex(sms.pages);
    setStatus('smsStatus',{kind:'ready',title:`${sms.pageCount} SMS pages indexed`,detail:`${file.name} · ${Math.round(sms.extractedChars/1000)}k text characters`});setProgress(100);finishProgress();updateRunState();
  }catch(error){state.sms=null;state.indexedPages=[];setStatus('smsStatus',{kind:'error',title:'SMS PDF could not be processed',detail:error.message||'Unsupported PDF'});finishProgress();toast(error.message||'Could not process SMS PDF',5000);}
}

async function handleSireUpload(event){
  const file=event.target.files?.[0];if(!file)return;
  setStatus('sireStatus',{kind:'loading',title:'Reading SIRE workbook…',detail:file.name});
  try{
    const sire=await parseSireWorkbook(file);
    sire.sheets=sire.sheets.map(sheet=>({...sheet,include:true,userMapping:{...sheet.inference.mapping}}));state.sire=sire;renderColumnMapping();
    setStatus('sireStatus',{kind:'ready',title:`${sire.totalRows} workbook rows detected`,detail:`${file.name} · ${sire.sheetCount} usable sheet${sire.sheetCount===1?'':'s'}`});updateRunState();
  }catch(error){state.sire=null;$('columnMapping').classList.add('hidden');setStatus('sireStatus',{kind:'error',title:'SIRE workbook could not be processed',detail:error.message||'Unsupported workbook'});toast(error.message||'Could not process SIRE workbook',5000);}
}

function renderColumnMapping(){
  if(!state.sire?.sheets?.length){$('columnMapping').classList.add('hidden');return;}
  $('columnMapping').classList.remove('hidden');
  const confidences=state.sire.sheets.map(s=>s.inference.confidence||0),avg=confidences.reduce((a,b)=>a+b,0)/Math.max(confidences.length,1);$('mappingConfidence').textContent=`${Math.round(avg*100)}% auto-detection confidence`;
  $('mappingSheets').innerHTML=state.sire.sheets.map((sheet,sheetIndex)=>{const needs=sheet.inference.needsConfirmation||sheet.userMapping.question==null;return `<article class="mapping-sheet" data-sheet="${sheetIndex}"><div class="mapping-sheet-head"><div><b>${esc(sheet.name)}</b><span>${sheet.rowCount} data rows · header row ${sheet.headerRowIndex+1}</span></div><label><input type="checkbox" data-include-sheet="${sheetIndex}" ${sheet.include?'checked':''}> Analyse this sheet</label></div><div class="mapping-grid">${ROLES.map(([role,label])=>mappingSelect(sheet,sheetIndex,role,label)).join('')}</div>${needs?'<div class="mapping-warning">AuditOS is not fully confident about this sheet. Confirm the <b>Question / Requirement</b> column before running the analysis.</div>':''}</article>`;}).join('');
  document.querySelectorAll('[data-map-role]').forEach(select=>select.addEventListener('change',e=>{const sheet=state.sire.sheets[Number(e.target.dataset.sheetIndex)],role=e.target.dataset.mapRole,value=e.target.value;sheet.userMapping[role]=value===''?null:Number(value);state.mappingDirty=true;updateRunState();}));
  document.querySelectorAll('[data-include-sheet]').forEach(input=>input.addEventListener('change',e=>{state.sire.sheets[Number(e.target.dataset.includeSheet)].include=e.target.checked;updateRunState();}));
}
function mappingSelect(sheet,sheetIndex,role,label){const selected=sheet.userMapping?.[role];return `<label>${esc(label)}${role==='question'?' *':''}<select data-map-role="${role}" data-sheet-index="${sheetIndex}"><option value="">Not mapped</option>${sheet.headers.map((h,i)=>`<option value="${i}" ${selected===i?'selected':''}>${esc(h||`Column ${i+1}`)}</option>`).join('')}</select></label>`;}
function mappingReady(){const included=state.sire?.sheets?.filter(s=>s.include)||[];return included.length>0&&included.every(s=>s.userMapping?.question!=null);}
function updateRunState(){$('runAnalysis').disabled=!(state.sms?.pages?.length&&state.sire?.sheets?.length&&mappingReady());}

async function runAnalysis(){
  if($('runAnalysis').disabled)return;const items=[];
  for(const sheet of state.sire.sheets){if(!sheet.include)continue;items.push(...normalizeSireRows(sheet.name,sheet.dataRows,sheet.userMapping,{firstDataRow:sheet.firstDataRow}));}
  if(!items.length){toast('No SIRE question rows were found using the selected column mapping.');return;}
  state.sireItems=items;state.results=[];state.selectedId=null;$('analysisProgress').classList.remove('hidden');$('results').classList.add('hidden');$('runAnalysis').disabled=true;$('analysisProgressTitle').textContent='Running SIRE ↔ SMS document gap analysis…';$('analysisProgressDetail').textContent=`0 of ${items.length} SIRE items mapped`;
  for(let i=0;i<items.length;i++){const mapped=mapSireItem(items[i],state.indexedPages);state.results.push({...mapped,auditorDecision:'Unreviewed'});if(i%8===0||i===items.length-1){const pct=Math.round((i+1)/items.length*100);$('analysisProgressPct').textContent=`${pct}%`;$('analysisProgressDetail').textContent=`${i+1} of ${items.length} SIRE items mapped`;await yieldToBrowser();}}
  state.results=rankResults(state.results);state.analysisName=`${state.sire.name} ↔ ${state.sms.name}`;$('analysisProgress').classList.add('hidden');$('runAnalysis').disabled=false;renderResults();await saveIndexedDB();toast(`${items.length} SIRE items analysed against ${state.sms.pageCount} SMS pages.`);
}
function yieldToBrowser(){return new Promise(resolve=>setTimeout(resolve,0));}
function renderResults(){$('results').classList.remove('hidden');$('resultsContext').textContent=`${state.analysisName||'Restored local analysis'} · ${state.results.length} SIRE items · document coverage only`;renderSummary();renderResultList();$('results').scrollIntoView({behavior:'smooth',block:'start'});}
function countClass(name){return state.results.filter(r=>r.classification===name).length;}
function renderSummary(){const boxes=[['SIRE items analysed',state.results.length,''],['Strong Coverage',countClass('Strong Coverage'),'good'],['Partial Coverage',countClass('Partial Coverage'),''],['Possible Gap',countClass('Possible Gap'),'warn'],['No Control Located',countClass('No Relevant Control Located'),'alert'],['Needs Review',countClass('Needs Auditor Review'),'warn']];$('summaryStrip').innerHTML=boxes.map(([label,value,kind])=>`<div class="summary-box ${kind}"><span>${label}</span><b>${value}</b></div>`).join('');}
function filteredResults(){const q=$('resultSearch').value.trim().toLowerCase(),coverage=$('coverageFilter').value,priority=$('priorityFilter').value,decision=$('decisionFilter').value;return state.results.filter(r=>(!q||`${r.reference} ${r.section} ${r.question} ${r.guidance}`.toLowerCase().includes(q))&&(coverage==='all'||r.classification===coverage)&&(priority==='all'||r.priority===priority)&&(decision==='all'||(r.auditorDecision||'Unreviewed')===decision));}
function renderResultList(){const results=filteredResults();$('resultCount').textContent=`Showing ${Math.min(results.length,VISIBLE_LIMIT)} of ${results.length} matching items${results.length>VISIBLE_LIMIT?' — refine filters to see more':''}`;$('resultList').innerHTML=results.slice(0,VISIBLE_LIMIT).map(r=>resultCard(r)).join('')||'<div class="detail-empty"><b>No SIRE items match these filters.</b></div>';document.querySelectorAll('[data-result-id]').forEach(card=>card.addEventListener('click',()=>selectResult(card.dataset.resultId)));}
function resultCard(r){const classificationClass={'Strong Coverage':'classification-strong','Partial Coverage':'classification-partial','Possible Gap':'classification-possible','No Relevant Control Located':'classification-none','Needs Auditor Review':'classification-review'}[r.classification]||'classification-review',pages=(r.matches||[]).map(m=>m.pageNumber).slice(0,3).join(', ');return `<article class="result-card ${state.selectedId===r.id?'active':''}" data-result-id="${esc(r.id)}"><div class="result-card-top"><span class="reference">${esc(r.reference)}</span><div class="result-main"><b>${esc(r.section||r.question)}</b><span>${esc(r.question)}</span></div><span class="badge ${classificationClass}">${esc(r.classification)}</span></div><div class="result-meta"><span class="priority-${String(r.priority).toLowerCase()}">${esc(r.priority)} review</span><span>${r.confidence}% confidence</span><span>${pages?`SMS p. ${pages}`:'No SMS page located'}</span><span>${esc(r.auditorDecision||'Unreviewed')}</span></div></article>`;}
function selectResult(id){state.selectedId=id;renderResultList();renderDetail();}
function currentResult(){return state.results.find(r=>String(r.id)===String(state.selectedId));}
function renderDetail(){
  const r=currentResult();if(!r){$('detailPanel').innerHTML='<div class="detail-empty"><div>↗</div><b>Select a SIRE item</b><span>Open any result to review exact SMS page matches and auditor actions.</span></div>';return;}
  const cls={'Strong Coverage':'classification-strong','Partial Coverage':'classification-partial','Possible Gap':'classification-possible','No Relevant Control Located':'classification-none','Needs Auditor Review':'classification-review'}[r.classification]||'classification-review';
  $('detailPanel').innerHTML=`<div class="detail"><div class="detail-header"><div><span class="detail-reference">${esc(r.reference)} · ${esc(r.sourceSheet)} row ${r.sourceRow}</span><h3>${esc(r.section||'SIRE requirement')}</h3><span class="trace">${r.confidence}% mapping confidence · ${esc(r.priority)} review</span></div><span class="badge ${cls}">${esc(r.classification)}</span></div><div class="coverage-note">${esc(r.coverageNote||'Document coverage only — not a compliance conclusion.')}</div><section class="detail-block"><h4>SIRE requirement</h4><p>${esc(r.question)}</p>${r.guidance?`<p class="trace" style="margin-top:6px">Guidance: ${esc(r.guidance)}</p>`:''}${r.rank||r.applicability?`<p class="trace" style="margin-top:5px">${esc([r.rank,r.applicability].filter(Boolean).join(' · '))}</p>`:''}</section><section class="detail-block"><h4>What appears covered</h4><div class="concepts">${(r.coveredConcepts||[]).length?(r.coveredConcepts||[]).map(c=>`<span class="concept">${esc(c)}</span>`).join(''):'<span class="trace">No strong concept coverage identified.</span>'}</div></section><section class="detail-block"><h4>What is not clearly supported</h4><div class="concepts">${(r.unsupportedConcepts||[]).length?(r.unsupportedConcepts||[]).map(c=>`<span class="concept missing">${esc(c)}</span>`).join(''):'<span class="trace">No major unmatched concepts detected by the deterministic mapper.</span>'}</div></section><section class="detail-block"><h4>Matched SMS sources</h4>${(r.matches||[]).length?(r.matches||[]).map(match=>smsMatch(match)).join(''):'<p>No SMS page exceeded the retrieval threshold. Use <b>Challenge Gap</b> to broaden the search before accepting this as a document gap.</p>'}</section>${r.challengeSummary?`<section class="detail-block"><h4>Challenge result</h4><p>${esc(r.challengeSummary)}</p></section>`:''}<section class="detail-block"><h4>Verify next</h4><ol>${(r.nextActions||[]).map(a=>`<li>${esc(a)}</li>`).join('')}</ol></section><section class="detail-block"><h4>Auditor decision</h4><div class="decision-grid">${AUDITOR_DECISIONS.filter(d=>d!=='Unreviewed').map(d=>`<button class="decision-btn ${(r.auditorDecision||'Unreviewed')===d?'active':''}" data-decision="${esc(d)}">${esc(d)}</button>`).join('')}<button class="decision-btn ${(r.auditorDecision||'Unreviewed')==='Unreviewed'?'active':''}" data-decision="Unreviewed">Reset to Unreviewed</button></div></section><div class="detail-actions"><button id="challengeGap" class="button button-primary">Challenge Gap</button><button id="openSmsPage" class="button button-secondary" ${(r.matches||[]).length?'':'disabled'}>Open SMS Page</button></div></div>`;
  $('challengeGap').addEventListener('click',()=>runChallengeGap(r.id));const open=$('openSmsPage');if(open&&!open.disabled)open.addEventListener('click',()=>openSmsPage(r.matches[0].pageNumber));document.querySelectorAll('[data-decision]').forEach(btn=>btn.addEventListener('click',()=>setAuditorDecision(r.id,btn.dataset.decision)));
}
function smsMatch(match){return `<article class="sms-match"><div class="sms-match-head"><b>PDF page ${match.pageNumber}${match.section?` · § ${esc(match.section)}`:''}</b><span>${match.score}% match${match.adjacent?' · adjacent page':''}</span></div>${match.heading?`<p><b>${esc(match.heading)}</b></p>`:''}<p>${esc(match.excerpt||match.text||'')}</p><p class="trace">${esc(match.why||'Source match')}</p></article>`;}

// Challenge Gap broadens deterministic retrieval using maritime synonyms, alternate terminology and nearby pages.
async function runChallengeGap(id){const index=state.results.findIndex(r=>String(r.id)===String(id));if(index<0)return;const original=state.results[index],challenged=challengeMapping(original,state.indexedPages,original);challenged.auditorDecision=original.auditorDecision||'Unreviewed';state.results[index]=challenged;state.results=rankResults(state.results);state.selectedId=challenged.id;renderSummary();renderResultList();renderDetail();await saveIndexedDB();toast(challenged.challengeSummary||'Challenge search completed.');}
async function setAuditorDecision(id,decision){const index=state.results.findIndex(r=>String(r.id)===String(id));if(index<0)return;state.results[index]=applyDecision(state.results[index],decision);state.results=rankResults(state.results);state.selectedId=id;renderSummary();renderResultList();renderDetail();await saveIndexedDB();toast(`Auditor decision: ${decision}`);}
function openSmsPage(pageNumber){if(state.pdfUrl){window.open(`${state.pdfUrl}#page=${Number(pageNumber)}`,'_blank','noopener,noreferrer');return;}toast('Re-upload the original SMS PDF to open the exact PDF page. The stored excerpt remains available here.',5000);}
function exportCsv(){if(!state.results.length){toast('Run the gap analysis before exporting.');return;}const blob=new Blob(['\ufeff',toCsv(state.results)],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`AuditOS-SIRE-SMS-Gap-Analysis-${new Date().toISOString().slice(0,10)}.csv`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),500);toast('CSV gap analysis exported.');}

const DB_NAME='AuditOSGapAnalysisIndexedDB',STORE='analysis';
function openDb(){return new Promise((resolve,reject)=>{const req=indexedDB.open(DB_NAME,1);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE,{keyPath:'id'});};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
async function saveIndexedDB(){if(!state.results.length||!state.sms?.pages?.length)return;try{const db=await openDb(),tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put({id:'latest',savedAt:new Date().toISOString(),analysisName:state.analysisName,smsMeta:{name:state.sms.name,pageCount:state.sms.pageCount,extractedChars:state.sms.extractedChars},sireMeta:state.sire?{name:state.sire.name,sheetCount:state.sire.sheetCount,totalRows:state.sire.totalRows}:null,pages:state.sms.pages.map(({_searchIndex,...p})=>p),sireItems:state.sireItems,results:state.results});await transactionDone(tx);db.close();}catch(error){console.warn('Local derived-state save skipped',error);}}
function transactionDone(tx){return new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}
async function loadIndexedDB(){try{const db=await openDb(),tx=db.transaction(STORE,'readonly'),req=tx.objectStore(STORE).get('latest'),record=await new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});db.close();if(!record?.results?.length)return;state.sms={...record.smsMeta,pages:record.pages};state.indexedPages=buildPageIndex(record.pages||[]);state.sireItems=record.sireItems||[];state.results=record.results;state.analysisName=record.analysisName||'Restored local analysis';setStatus('smsStatus',{kind:'ready',title:`${state.sms.pageCount} derived SMS pages restored`,detail:'Re-upload original PDF only to open the source file directly'});setStatus('sireStatus',{kind:'ready',title:`${state.results.length} SIRE items restored`,detail:record.sireMeta?.name||'Local browser analysis'});renderResults();toast('Restored the last derived analysis stored on this device.');}catch(error){console.warn('No local analysis restored',error);}}
async function clearAnalysis(){if(!confirm('Clear this browser’s AuditOS analysis, decisions and derived source text?'))return;try{const db=await openDb(),tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).clear();await transactionDone(tx);db.close();}catch{}if(state.pdfUrl)URL.revokeObjectURL(state.pdfUrl);location.reload();}
loadIndexedDB();
