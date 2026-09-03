import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const root=new URL('../',import.meta.url);
async function text(path){return readFile(new URL(path,root),'utf8');}
test('upload UI exposes required SMS and SIRE controls and guardrail',async()=>{const html=await text('index.html');for(const id of ['smsFile','sireFile','runAnalysis','columnMapping','results','exportCsv','clearAnalysis'])assert.match(html,new RegExp(`id=["']${id}["']`));assert.match(html,/Document coverage only — not a compliance conclusion\./);assert.match(html,/Upload Company SMS PDF/);assert.match(html,/Upload SIRE Excel/);});
test('application wires parsing, mapping, challenge, decisions and source page opening',async()=>{const js=await text('app.js');for(const fn of ['parseSmsPdf','parseSireWorkbook','normalizeSireRows','mapSireItem','challengeMapping','applyDecision','toCsv','buildPageIndex'])assert.match(js,new RegExp(`\\b${fn}\\b`));assert.match(js,/openSmsPage/);assert.match(js,/Challenge Gap/);assert.match(js,/IndexedDB|indexedDB/i);});
test('focused build contains no Supabase or login dependency',async()=>{const all=(await text('index.html'))+(await text('app.js'));assert.doesNotMatch(all,/supabase/i);assert.doesNotMatch(all,/sign in|login|password/i);});
