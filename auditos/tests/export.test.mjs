import test from 'node:test';
import assert from 'node:assert/strict';
import { applyDecision, toCsv } from '../core/export.js';
const sample={reference:'5.4.3',sourceSheet:'Questions',sourceRow:12,section:'Enclosed Space',classification:'Partial Coverage',confidence:71,matches:[{pageNumber:10},{pageNumber:11}],unsupportedConcepts:['continuous','communication'],auditorDecision:'Unreviewed'};
test('applies only supported auditor review decisions',()=>{const updated=applyDecision(sample,'Needs Verification');assert.equal(updated.auditorDecision,'Needs Verification');assert.throws(()=>applyDecision(sample,'Compliant'),/Unsupported auditor decision/);});
test('exports traceable CSV and escapes commas and quotes',()=>{const csv=toCsv([{...sample,section:'Enclosed, Space "Entry"'}]);assert.match(csv,/SIRE Reference/);assert.match(csv,/5\.4\.3/);assert.match(csv,/10; 11/);assert.match(csv,/"Enclosed, Space ""Entry"""/);assert.match(csv,/Needs Verification|Unreviewed/);});
test('export contains no compliance conclusion wording',()=>{const csv=toCsv([sample]);assert.doesNotMatch(csv,/non-?compliant|compliant/i);});
