import type {
  RecurringConditionalPaymentParams,
  Step,
  WeeklySchedule,
  Weekday,
  WorkflowTemplate,
} from '../types.js';

const WEEKDAYS: Weekday[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

const RECURRENCE_CUE = /\b(every|recurring|weekly)\b/i;
const PAYMENT_CUE = /\b(pay|payment|invoice)\b/i;
const DAY_RE = new RegExp(`every (${WEEKDAYS.join('|')})`, 'i');
const CAP_RE = /(?:up to|capped at)\s*\$?(\d+(?:\.\d+)?)/i;
const CONDITION_RE = /\b(approved)\b\s+invoice/i;
const ALLOWLIST_RE = /\b(allowlisted|approved)\s+vendors?\b/i;

function extractParams(instruction: string): RecurringConditionalPaymentParams {
  const dayMatch = DAY_RE.exec(instruction);
  if (!dayMatch) {
    throw new Error(
      `recurring-conditional-payment: could not find a weekday cue (e.g. "every Friday") in: "${instruction}"`,
    );
  }
  const schedule: WeeklySchedule = { frequency: 'weekly', day: dayMatch[1]!.toLowerCase() as Weekday };

  const capMatch = CAP_RE.exec(instruction);
  if (!capMatch) {
    throw new Error(
      `recurring-conditional-payment: could not find a spend cap cue (e.g. "up to $500") in: "${instruction}"`,
    );
  }

  const conditionMatch = CONDITION_RE.exec(instruction);
  const allowlistMatch = ALLOWLIST_RE.exec(instruction);

  return {
    schedule,
    condition: {
      field: 'status',
      equals: conditionMatch ? conditionMatch[1]!.toLowerCase() : 'approved',
    },
    spendCap: { perPayment: Number(capMatch[1]), currency: 'USDC' },
    allowlist: allowlistMatch ? allowlistMatch[1]!.toLowerCase() : 'allowlisted',
  };
}

function buildSteps(params: RecurringConditionalPaymentParams): Step[] {
  return [
    { kind: 'fetch', params: { schedule: params.schedule, source: 'invoices' } },
    { kind: 'compliance_check', params: params.condition },
    { kind: 'guardrail_check', params: { spendCap: params.spendCap, allowlist: params.allowlist } },
    { kind: 'settlement', params: { currency: params.spendCap.currency } },
    { kind: 'attestation' },
    { kind: 'ledger_write' },
  ];
}

export const recurringConditionalPayment: WorkflowTemplate<
  'recurring-conditional-payment',
  RecurringConditionalPaymentParams
> = {
  id: 'recurring-conditional-payment',
  match(instruction: string): boolean {
    return RECURRENCE_CUE.test(instruction) && PAYMENT_CUE.test(instruction);
  },
  extractParams,
  buildSteps,
};
