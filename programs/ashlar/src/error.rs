use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Only the counter authority can update this counter")]
    Unauthorized,
    #[msg("Counter has reached the maximum value")]
    CounterOverflow,
    #[msg("This step was called out of order for the workflow's compiled step sequence")]
    OutOfOrderStep,
    #[msg("Workflow is not in progress (already completed or rejected)")]
    WorkflowNotInProgress,
    #[msg("Allowlist exceeds the maximum of 4 entries")]
    AllowlistTooLarge,
    #[msg("Workflow is not paused awaiting an owner override")]
    NotPendingOverride,
    #[msg("Recipient count must be between 1 and 4, and must match the amounts provided")]
    InvalidRecipientCount,
    #[msg("A recipient's token account is not owned by a wallet on this workflow's allowlist")]
    RecipientNotAllowlisted,
    #[msg("A recipient's token account is for the wrong mint")]
    InvalidMint,
    #[msg("Total settlement amount overflowed u64")]
    AmountOverflow,
}
