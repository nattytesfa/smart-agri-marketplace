const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ts = require('typescript');

// Run the actual frontend helpers with the project's existing TypeScript compiler.
// No browser, service keys, database connection or additional dependencies needed.
const source = fs.readFileSync(path.join(__dirname, '../src/app/transactions/disputeResolution.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });
const loaded = { exports: {} };
vm.runInNewContext(compiled.outputText, { module: loaded, exports: loaded.exports, BigInt });
const { exactMinor, formatVirtualAmount, emptyResolution, validateResolution } = loaded.exports;
const draft = (update = {}) => ({ ...emptyResolution(), decision: 'refund', note: 'Evidence reviewed and the buyer claim is upheld.', ...update });

test('formats exact API amounts without floating-point conversions or repricing', () => {
  assert.equal(formatVirtualAmount('501000.00'), '501,000.00');
  assert.equal(formatVirtualAmount('999999999999.99'), '999,999,999,999.99');
  assert.equal(formatVirtualAmount('-1234.01'), '-1,234.01');
  assert.equal(formatVirtualAmount('10.075'), '10.075');
});
test('parses large exact cents safely', () => {
  assert.equal(exactMinor('999999999999.99'), 99999999999999n);
  assert.equal(exactMinor('0.01'), 1n);
  assert.equal(exactMinor('2000.5'), 200050n);
});
for (const value of ['-1', '1.001', '1e3', 'NaN', '1,000.00', '', 'Infinity']) {
  test(`rejects invalid refund input ${JSON.stringify(value)}`, () => {
    assert.equal(exactMinor(value), null);
  });
}
test('new resolution drafts do not share notes or amounts', () => {
  const first = emptyResolution();
  first.note = 'Draft for farmer A'; first.amount = '100';
  const second = emptyResolution();
  assert.equal(second.note, ''); assert.equal(second.amount, '');
});
test('requires a decision and an auditable note', () => {
  assert.match(validateResolution(emptyResolution(), '100.00'), /Choose/);
  assert.match(validateResolution(draft({ note: 'short' }), '100.00'), /10 characters/);
  assert.match(validateResolution(draft({ note: 'x'.repeat(4001) }), '100.00'), /4,000/);
});
test('full refund uses remaining held balance without requiring a client amount', () => {
  assert.equal(validateResolution(draft(), '100.00'), null);
  assert.match(validateResolution(draft(), '0.00'), /no eligible/);
});
test('partial refund must be positive, exact and no greater than held cents', () => {
  for (const amount of ['0', '-1', '1.001']) assert.ok(validateResolution(draft({ refundMode: 'partial', amount }), '100.00'));
  assert.match(validateResolution(draft({ refundMode: 'partial', amount: '100.01' }), '100.00'), /cannot exceed/);
  assert.equal(validateResolution(draft({ refundMode: 'partial', amount: '99.99' }), '100.00'), null);
  assert.equal(validateResolution(draft({ refundMode: 'partial', amount: '100.00' }), '100.00'), null);
});
test('non-refund decisions ignore a previous partial refund amount', () => {
  for (const decision of ['review', 'settle', 'reject']) {
    assert.equal(validateResolution(draft({ decision, refundMode: 'partial', amount: 'invalid' }), '100.00'), null);
  }
});
