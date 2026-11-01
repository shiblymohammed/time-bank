const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const Module = require('node:module');
const path = require('node:path');
const filename = path.resolve(__dirname, '../src/lib/request-utils.ts');
const loaded = new Module(filename, module);
loaded._compile(
  ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText,
  filename,
);
const { indiaISO, indiaInput, indiaTime, dispatchMessage } = loaded.exports;
test('India dates cross UTC midnight without using the machine timezone', () => {
  assert.equal(indiaISO('2030-01-01T01:00'), '2029-12-31T19:30:00.000Z');
  assert.equal(indiaInput('2029-12-31T19:30:00.000Z'), '2030-01-01T01:00');
});
test('invalid calendar dates are rejected rather than silently rolled forward', () => {
  for (const input of [
    '2030-02-30T10:00',
    '2030-13-01T10:00',
    '2030-01-01T24:00',
    '',
    '2030-01-01T10:00Z',
  ])
    assert.throws(() => indiaISO(input));
  assert.equal(indiaISO('2032-02-29T10:00'), '2032-02-29T04:30:00.000Z');
  assert.equal(indiaTime(null), 'Not recorded');
});
test('dispatch feedback follows the actual saved status', () => {
  assert.match(dispatchMessage({ status: 'OFFERED' }), /must accept/);
  assert.match(dispatchMessage({ status: 'ACCEPTED' }), /assignment saved/);
  assert.match(dispatchMessage({}), /check the assignment status/);
});
