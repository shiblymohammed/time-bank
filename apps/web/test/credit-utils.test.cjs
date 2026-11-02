const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const Module = require('node:module');
const path = require('node:path');
const filename = path.resolve(__dirname, '../src/lib/credit-utils.ts');
const loaded = new Module(filename, module);
loaded._compile(
  ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText,
  filename,
);
const { creditPermissions, canResolveReview, creditAmount, creditRetryBody } = loaded.exports;

test('credit actions follow coordinator, local administrator and global administrator authority', () => {
  assert.deepEqual(creditPermissions(['COORDINATOR'], false), {
    investigate: true,
    administer: false,
    controlWallet: false,
  });
  assert.deepEqual(creditPermissions(['MUNICIPALITY_ADMIN'], false), {
    investigate: false,
    administer: true,
    controlWallet: false,
  });
  assert.deepEqual(creditPermissions([], true), {
    investigate: true,
    administer: true,
    controlWallet: true,
  });
  const review = {
    decision: null,
    investigated_by: 'coordinator',
    opened_by: 'opener',
    subject_user_id: 'member',
    pending_children: 0,
  };
  assert.equal(canResolveReview(review, 'admin', true), true);
  for (const actor of ['coordinator', 'opener', 'member'])
    assert.equal(canResolveReview(review, actor, true), false);
  assert.equal(canResolveReview({ ...review, pending_children: 1 }, 'admin', true), false);
  assert.equal(canResolveReview({ ...review, decision: 'CORRECT' }, 'admin', true), false);
  assert.equal(canResolveReview({ ...review, investigated_by: null }, 'admin', true), false);
  assert.equal(canResolveReview(review, 'admin', false), false);
});

test('credit inputs preserve hundredths and respect both service and available balance limits', () => {
  assert.equal(creditAmount('0.01', 0.5), 0.01);
  assert.equal(creditAmount('0.50', 0.5), 0.5);
  for (const value of ['0', '-1', '0.501', '1e2', 'Infinity', '', '0.51'])
    assert.throws(() => creditAmount(value, 0.5));
  assert.throws(() => creditAmount('1000.01', 2000));
});

test('unchanged credit retries reuse a key while changed instructions receive a new key', () => {
  let sequence = 0;
  const body = creditRetryBody(() => `operation-${++sequence}`);
  assert.equal(body({ amount: 1, reason: 'Reviewed' }).idempotencyKey, 'operation-1');
  assert.equal(body({ reason: 'Reviewed', amount: 1 }).idempotencyKey, 'operation-1');
  assert.equal(body({ reason: 'Reviewed', amount: 2 }).idempotencyKey, 'operation-2');
});
