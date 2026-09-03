import test from 'node:test';
import assert from 'node:assert/strict';
import { inferColumnMapping, normalizeSireRows } from '../core/excel-schema.js';

test('infers common SIRE workbook columns', () => {
  const headers = ['Question No', 'Section', 'Question', 'Guidance', 'Rank', 'Applicability'];
  const rows = [
    ['5.4.3', 'Enclosed Space Entry', 'Are procedures established for enclosed space entry?', 'Verify permits and gas testing', 'Chief Officer', 'All vessels'],
    ['5.4.4', 'Gas Testing', 'Is atmosphere testing controlled?', 'Check calibration and records', '2/O', 'Tankers'],
  ];
  const result = inferColumnMapping(headers, rows);
  assert.equal(result.mapping.reference, 0);
  assert.equal(result.mapping.section, 1);
  assert.equal(result.mapping.question, 2);
  assert.equal(result.mapping.guidance, 3);
  assert.equal(result.mapping.rank, 4);
  assert.equal(result.mapping.applicability, 5);
  assert.equal(result.needsConfirmation, false);
  assert.ok(result.confidence >= 0.7);
});

test('flags ambiguous workbook when a question column cannot be confidently identified', () => {
  const headers = ['A', 'B', 'C'];
  const rows = [['1', 'foo', 'bar'], ['2', 'baz', 'qux']];
  const result = inferColumnMapping(headers, rows);
  assert.equal(result.needsConfirmation, true);
  assert.equal(result.mapping.question, null);
});

test('normalizes rows with original sheet and row traceability', () => {
  const mapping = { reference: 0, section: 1, question: 2, guidance: 3, rank: 4, applicability: 5 };
  const rows = [
    ['5.4.3', 'Enclosed Space', 'Are entry controls defined?', 'Review permits', 'C/O', 'All'],
    ['', '', '', '', '', ''],
  ];
  const normalized = normalizeSireRows('SIRE Questions', rows, mapping, { firstDataRow: 12 });
  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].reference, '5.4.3');
  assert.equal(normalized[0].sourceSheet, 'SIRE Questions');
  assert.equal(normalized[0].sourceRow, 12);
  assert.equal(normalized[0].question, 'Are entry controls defined?');
});
