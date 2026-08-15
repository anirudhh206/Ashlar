use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Counter {
    pub count: u64,
    pub authority: Pubkey,
}

#[derive(AnchorSerialize, AnchorDeserialize, InitSpace, Clone, Copy, PartialEq, Eq, Debug)]
pub enum WorkflowType {
    RecurringConditionalPayment,
    OneTimeApprovalGatedTransfer,
}

/// The fixed gate sequence a compiled workflow enforces, in order. Mirrors
/// `@ashlar/compiler`'s step vocabulary (`attestation`/`ledger_write` are implicit side
/// effects of each of these on-chain, not separate steps here).
#[derive(AnchorSerialize, AnchorDeserialize, InitSpace, Clone, Copy, PartialEq, Eq, Debug)]
pub enum StepKind {
    Fetch,
    ComplianceCheck,
    ManualApproval,
    GuardrailCheck,
    MockSettlement,
}

#[derive(AnchorSerialize, AnchorDeserialize, InitSpace, Clone, Copy, PartialEq, Eq, Debug)]
pub enum WorkflowStatus {
    InProgress,
    Completed,
    Rejected,
    /// An over-cap guardrail failure — resumable only by the owner's own signature via
    /// `resume_after_override`, unlike an allowlist failure (which is terminal `Rejected`).
    PendingOverrideApproval,
}

#[derive(AnchorSerialize, AnchorDeserialize, InitSpace, Clone, Copy, PartialEq, Eq, Debug)]
pub enum AttestationOutcome {
    Passed,
    Failed,
    Executed,
}

#[account]
#[derive(InitSpace)]
pub struct WorkflowInstance {
    pub owner: Pubkey,
    pub workflow_id: u64,
    pub workflow_type: WorkflowType,
    #[max_len(4)]
    pub steps: Vec<StepKind>,
    pub current_step: u8,
    pub status: WorkflowStatus,
    pub spend_cap: u64,
    #[max_len(4)]
    pub allowlist: Vec<Pubkey>,
    pub pending_amount: u64,
    pub pending_recipient: Pubkey,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Attestation {
    pub workflow: Pubkey,
    pub step_index: u8,
    pub step_kind: StepKind,
    pub executed_by: Pubkey,
    pub timestamp: i64,
    pub outcome: AttestationOutcome,
    pub data_hash: [u8; 32],
}

#[derive(AnchorSerialize, AnchorDeserialize, InitSpace, Clone, Copy, Debug)]
pub struct LedgerEntry {
    pub step_index: u8,
    pub step_kind: StepKind,
    pub outcome: AttestationOutcome,
    pub timestamp: i64,
}

#[account]
#[derive(InitSpace)]
pub struct Ledger {
    pub workflow: Pubkey,
    #[max_len(4)]
    pub entries: Vec<LedgerEntry>,
}
