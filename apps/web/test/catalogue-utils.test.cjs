const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const Module = require('node:module');
const path = require('node:path');
const filename = path.resolve(__dirname, '../src/lib/catalogue-utils.ts');
const loaded = new Module(filename, module);
loaded._compile(
  ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText,
  filename,
);
const { staffing, skillCodes } = loaded.exports;
test('local staffing respects the central minimum and preferred capacity', () => {
  assert.deepEqual(staffing('2', '3', 2), { minVolunteers: 2, preferredVolunteers: 3 });
  for (const [min, pref] of [
    ['1', '3'],
    ['3', '2'],
    ['2.5', '3'],
    ['NaN', '3'],
  ])
    assert.throws(() => staffing(min, pref, 2));
});
test('skill codes are trimmed and deduplicated without changing credential case', () => {
  assert.deepEqual(skillCodes('FIRST_AID, FIRST_AID, driving', true), ['FIRST_AID', 'driving']);
  assert.deepEqual(skillCodes('', false), []);
});
test('required skills cannot be empty or exceed credential field limits', () => {
  assert.throws(() => skillCodes('', true));
  assert.throws(() => skillCodes('a'.repeat(51), true));
  assert.throws(() =>
    skillCodes(Array.from({ length: 51 }, (_, i) => `SKILL_${i}`).join(','), true),
  );
});
