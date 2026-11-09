const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const Module = require('node:module');
const path = require('node:path');
const filename = path.resolve(__dirname, '../src/lib/report-utils.ts');
const loaded = new Module(filename, module);
loaded._compile(
  ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText,
  filename,
);
const { currentIndiaMonth, previousIndiaMonth, periodQuery, shown } = loaded.exports;

test('the month follows India time, not the browser clock', () => {
  // 31 October, 19:00 UTC is already 1 November in India.
  assert.equal(currentIndiaMonth(new Date('2026-10-31T19:00:00Z')), '2026-11');
  assert.equal(currentIndiaMonth(new Date('2026-10-31T18:00:00Z')), '2026-10');
});

test('the previous month crosses a new year', () => {
  assert.equal(previousIndiaMonth(new Date('2027-01-15T00:00:00Z')), '2026-12');
});

test('a period becomes a query only when it is complete', () => {
  assert.equal(periodQuery({ mode: 'month', month: '2026-10', from: '', to: '' }), 'month=2026-10');
  assert.equal(periodQuery({ mode: 'month', month: '', from: '', to: '' }), null);
  assert.equal(periodQuery({ mode: 'range', month: '2026-10', from: '2026-10-01', to: '' }), null);
  assert.equal(
    periodQuery({ mode: 'range', month: '', from: '2026-10-01', to: '2026-10-20' }),
    'from=2026-10-01&to=2026-10-20',
  );
});

test('held-back figures show as they came', () => {
  assert.equal(shown('<5'), '<5');
  assert.equal(shown('hidden'), 'hidden');
  assert.equal(shown(1234), (1234).toLocaleString('en-IN'));
});
