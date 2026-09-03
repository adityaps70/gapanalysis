const clean = (v='') => String(v ?? '').trim();
const norm = v => clean(v).toLowerCase().replace(/[_\-\/]+/g,' ').replace(/\s+/g,' ');

const ROLE_ALIASES = {
  reference: ['question no','question number','question id','reference','ref','sire ref','sire reference','id','no.','number'],
  section: ['section','chapter','topic','area','category','sub section','subsection'],
  question: ['question','requirement','inspection question','sire question','criterion','criteria','requirement text','question text'],
  guidance: ['guidance','notes','guidance notes','inspection guidance','guideline','expected evidence','evidence','remarks'],
  rank: ['rank','role','responsible rank','interview role','position'],
  applicability: ['applicability','applicable','applies to','vessel applicability','vessel type','ship type'],
  risk: ['risk','risk level','priority','criticality'],
};

function headerScore(header, aliases){
  const h = norm(header);
  if (!h) return 0;
  let best = 0;
  for (const alias of aliases){
    if (h === alias) best = Math.max(best, 1);
    else if ((h.length >= 3 && h.includes(alias)) || (alias.length >= 3 && h.length >= 3 && alias.includes(h))) best = Math.max(best, 0.78);
    else {
      const a = alias.split(' '), words = h.split(' ');
      const overlap = a.filter(x => words.includes(x)).length / Math.max(a.length,1);
      best = Math.max(best, overlap * 0.58);
    }
  }
  return best;
}

function sampleQuestionScore(values){
  const vals = values.map(clean).filter(Boolean);
  if (!vals.length) return 0;
  const avg = vals.reduce((n,v)=>n+v.length,0)/vals.length;
  const punct = vals.filter(v=>/[?]/.test(v)).length/vals.length;
  const language = vals.filter(v=>/\b(is|are|does|do|has|have|should|shall|must|procedure|requirement|verify|ensure)\b/i.test(v)).length/vals.length;
  return Math.min(1, (avg>35?0.45:avg>18?0.25:0) + punct*0.3 + language*0.35);
}

function sampleReferenceScore(values){
  const vals=values.map(clean).filter(Boolean);
  if(!vals.length) return 0;
  const hits=vals.filter(v=>/^\d+(?:\.\d+){1,4}[A-Za-z]?$/.test(v) || /^[A-Za-z]{1,5}[- ]?\d+(?:\.\d+)*$/.test(v)).length;
  return hits/vals.length;
}

export function inferColumnMapping(headers=[], sampleRows=[]){
  const mapping = {};
  const scores = {};
  const used = new Set();
  for (const [role, aliases] of Object.entries(ROLE_ALIASES)){
    let best = { index:null, score:0 };
    headers.forEach((header,index)=>{
      let score = headerScore(header, aliases);
      const values = sampleRows.slice(0,20).map(r=>Array.isArray(r)?r[index]:'');
      if (role === 'question') score = Math.max(score, headerScore(header, aliases)*0.75 + sampleQuestionScore(values)*0.35);
      if (role === 'reference') score = Math.max(score, headerScore(header, aliases)*0.8 + sampleReferenceScore(values)*0.25);
      if (score > best.score && !used.has(index)) best={index,score};
    });
    const threshold = role === 'question' ? 0.48 : 0.52;
    mapping[role] = best.score >= threshold ? best.index : null;
    scores[role] = Number(best.score.toFixed(3));
    if (mapping[role] != null) used.add(mapping[role]);
  }

  if (mapping.question == null){
    let best = { index:null, score:0 };
    headers.forEach((_,index)=>{
      const score = sampleQuestionScore(sampleRows.slice(0,20).map(r=>Array.isArray(r)?r[index]:''));
      if (score > best.score) best={index,score};
    });
    if (best.score >= 0.72){ mapping.question=best.index; scores.question=Number(best.score.toFixed(3)); }
  }

  const requiredConfidence = mapping.question == null ? 0 : scores.question;
  const detected = Object.values(mapping).filter(v=>v!=null).length;
  const confidence = Number(Math.min(1, (requiredConfidence*0.7)+(Math.min(detected,6)/6)*0.3).toFixed(3));
  return { mapping, confidence, needsConfirmation: mapping.question == null || confidence < 0.62, scores };
}

export function normalizeSireRows(sheetName, rows=[], mapping={}, { firstDataRow=2 }={}){
  const get = (row, role) => mapping?.[role] == null ? '' : clean(row?.[mapping[role]]);
  const out=[];
  rows.forEach((row,i)=>{
    if(!Array.isArray(row)) return;
    const question=get(row,'question');
    const section=get(row,'section');
    const guidance=get(row,'guidance');
    const reference=get(row,'reference');
    if(!question && !section && !guidance) return;
    if(!question) return;
    out.push({
      id:`${sheetName}:${firstDataRow+i}`,
      reference:reference || `${sheetName} row ${firstDataRow+i}`,
      generatedReference:!reference,
      section,
      question,
      guidance,
      rank:get(row,'rank'),
      applicability:get(row,'applicability'),
      risk:get(row,'risk'),
      sourceSheet:sheetName,
      sourceRow:firstDataRow+i,
      raw:row.map(clean),
    });
  });
  return out;
}

export const __test = { headerScore, sampleQuestionScore, sampleReferenceScore, norm };
