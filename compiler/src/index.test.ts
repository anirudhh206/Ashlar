import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { compileInstruction } from './index.js';

const RECURRING_INSTRUCTION =
  'Pay every approved invoice every Friday, up to $500 per payment, to allowlisted vendors.';
const ONE_TIME_INSTRUCTION = 'Transfer $1000 to Acme Corp, pending my approval.';

test('two different instructions produce two differently-structured step sequences', () => {
  const recurring = compileInstruction(RECURRING_INSTRUCTION);
  const oneTime = compileInstruction(ONE_TIME_INSTRUCTION);

  assert.notEqual(recurring.workflowType, oneTime.workflowType);

  const recurringKinds = recurring.steps.map((s) => s.kind);
  const oneTimeKinds = oneTime.steps.map((s) => s.kind);
  assert.notDeepEqual(recurringKinds, oneTimeKinds);

  assert.ok(recurringKinds.includes('compliance_check'));
  assert.ok(!recurringKinds.includes('manual_approval'));

  assert.ok(oneTimeKinds.includes('manual_approval'));
  assert.ok(!oneTimeKinds.includes('compliance_check'));
});

test('recurring-conditional-payment extracts schedule, cap, condition, and allowlist', () => {
  const workflow = compileInstruction(RECURRING_INSTRUCTION);
  assert.equal(workflow.workflowType, 'recurring-conditional-payment');
  if (workflow.workflowType !== 'recurring-conditional-payment') return;

  assert.deepEqual(workflow.parameters.schedule, { frequency: 'weekly', day: 'friday' });
  assert.equal(workflow.parameters.spendCap.perPayment, 500);
  assert.equal(workflow.parameters.condition.equals, 'approved');
  assert.equal(workflow.parameters.allowlist, 'allowlisted');
});

test('one-time-approval-gated-transfer extracts recipient and amount', () => {
  const workflow = compileInstruction(ONE_TIME_INSTRUCTION);
  assert.equal(workflow.workflowType, 'one-time-approval-gated-transfer');
  if (workflow.workflowType !== 'one-time-approval-gated-transfer') return;

  assert.equal(workflow.parameters.amount, 1000);
  assert.equal(workflow.parameters.recipient, 'Acme Corp');
  assert.equal(workflow.parameters.requiresApproval, true);
});

test('an instruction matching no template throws a clear error', () => {
  assert.throws(() => compileInstruction('What is the weather today?'), /no template matched/);
});
