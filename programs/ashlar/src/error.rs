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
    #[msg("Recipient account does not match the recipient recorded by the guardrail check")]
    RecipientMismatch,
}
