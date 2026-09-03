const DECISIONS=new Set(['Unreviewed','Confirmed Gap','Dismissed','Needs Verification']);
const clean=v=>String(v??'').trim();

export function applyDecision(result,decision){
  if(!DECISIONS.has(decision)) throw new Error(`Unsupported auditor decision: ${decision}`);
  return {...result,auditorDecision:decision,reviewedAt:decision==='Unreviewed'?null:new Date().toISOString()};
}
function csvCell(value){const s=Array.isArray(value)?value.join('; '):clean(value);return /[",\n\r]/.test(s)?`"${s.replace(/"/g,'""')}"`:s;}
export function toCsv(results=[]){
  const headers=['SIRE Reference','Sheet','Excel Row','Section / Topic','Question / Requirement','Document Coverage','Confidence %','Priority','Matched SMS Pages','Matched SMS Sections','Unsupported Concepts','Auditor Decision','Coverage Note'];
  const rows=results.map(r=>[r.reference,r.sourceSheet,r.sourceRow,r.section,r.question,r.classification,r.confidence,r.priority,(r.matches||[]).map(m=>m.pageNumber).join('; '),(r.matches||[]).map(m=>m.section||m.heading||'').filter(Boolean).join('; '),(r.unsupportedConcepts||[]).join('; '),r.auditorDecision||'Unreviewed',r.coverageNote||'Document coverage only — auditor judgement required.']);
  return [headers,...rows].map(row=>row.map(csvCell).join(',')).join('\r\n');
}
export const AUDITOR_DECISIONS=[...DECISIONS];
