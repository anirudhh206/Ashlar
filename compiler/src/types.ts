/**
 * Fixed step vocabulary mirroring Phase 2's on-chain pipeline stages
 * (Fetch -> Compliance -> Guardrail -> Settlement -> Attestation -> Ledger),
 * so a compiled workflow can be consumed directly without translation.
 */
export type Step =
  | { kind: 'fetch'; params: { schedule?: WeeklySchedule; source: string } }
  | { kind: 'compliance_check'; params: { field: string; equals: string } }
  | { kind: 'manual_approval'; params: { approver: string } }
  | { kind: 'guardrail_check'; params: { spendCap?: SpendCap; allowlist?: string } }
  | { kind: 'settlement'; params: { recipient?: string; amount?: number; currency: string } }
  | { kind: 'attestation' }
  | { kind: 'ledger_write' };

export type Weekday =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';

export interface WeeklySchedule {
  frequency: 'weekly';
  day: Weekday;
}

export interface SpendCap {
  perPayment: number;
  currency: string;
}

export interface RecurringConditionalPaymentParams {
  schedule: WeeklySchedule;
  condition: { field: string; equals: string };
  spendCap: SpendCap;
  allowlist: string;
}

export interface OneTimeApprovalGatedTransferParams {
  recipient: string;
  amount: number;
  currency: string;
  requiresApproval: true;
}

export type WorkflowType = 'recurring-conditional-payment' | 'one-time-approval-gated-transfer';

export type CompiledWorkflow =
  | {
      workflowType: 'recurring-conditional-payment';
      parameters: RecurringConditionalPaymentParams;
      steps: Step[];
    }
  | {
      workflowType: 'one-time-approval-gated-transfer';
      parameters: OneTimeApprovalGatedTransferParams;
      steps: Step[];
    };

export interface WorkflowTemplate<T extends WorkflowType, P> {
  id: T;
  match(instruction: string): boolean;
  extractParams(instruction: string): P;
  buildSteps(params: P): Step[];
}
