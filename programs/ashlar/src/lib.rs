pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("7AESNgNKweEEveyb4vnuTpKALzjDhupFauAfgSc97z7t");

#[program]
pub mod ashlar {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        crate::instructions::initialize::handle_initialize(ctx)
    }

    pub fn increment(ctx: Context<Increment>) -> Result<()> {
        crate::instructions::increment::handle_increment(ctx)
    }

    pub fn initialize_workflow(
        ctx: Context<InitializeWorkflow>,
        workflow_id: u64,
        workflow_type: WorkflowType,
        spend_cap: u64,
        allowlist: Vec<Pubkey>,
    ) -> Result<()> {
        crate::instructions::initialize_workflow::handle_initialize_workflow(
            ctx,
            workflow_id,
            workflow_type,
            spend_cap,
            allowlist,
        )
    }

    pub fn fetch_step(ctx: Context<FetchStep>, workflow_id: u64, invoice_id: u64, amount: u64) -> Result<()> {
        crate::instructions::fetch_step::handle_fetch_step(ctx, workflow_id, invoice_id, amount)
    }

    pub fn compliance_check(ctx: Context<ComplianceCheck>, workflow_id: u64, approved: bool) -> Result<()> {
        crate::instructions::compliance_check::handle_compliance_check(ctx, workflow_id, approved)
    }

    pub fn manual_approval(ctx: Context<ManualApproval>, workflow_id: u64, approved: bool) -> Result<()> {
        crate::instructions::manual_approval::handle_manual_approval(ctx, workflow_id, approved)
    }

    pub fn guardrail_check(
        ctx: Context<GuardrailCheck>,
        workflow_id: u64,
        amount: u64,
        recipient: Pubkey,
    ) -> Result<()> {
        crate::instructions::guardrail_check::handle_guardrail_check(ctx, workflow_id, amount, recipient)
    }

    pub fn mock_settlement(
        ctx: Context<MockSettlement>,
        workflow_id: u64,
        settlement_reference: String,
    ) -> Result<()> {
        crate::instructions::mock_settlement::handle_mock_settlement(ctx, workflow_id, settlement_reference)
    }

    pub fn resume_after_override(
        ctx: Context<ResumeAfterOverride>,
        workflow_id: u64,
        approved: bool,
    ) -> Result<()> {
        crate::instructions::resume_after_override::handle_resume_after_override(ctx, workflow_id, approved)
    }

    /// Real fund movement, on-chain: pays 1–4 recipients directly via an SPL `transfer_checked`
    /// CPI per leg, atomically with the settlement attestation. See
    /// instructions/settle_direct_transfer.rs's doc comment for the full design rationale.
    pub fn settle_direct_transfer<'info>(
        ctx: Context<'info, SettleDirectTransfer<'info>>,
        workflow_id: u64,
        amounts: Vec<u64>,
        decimals: u8,
        settlement_reference: String,
    ) -> Result<()> {
        crate::instructions::settle_direct_transfer::handle_settle_direct_transfer(
            ctx,
            workflow_id,
            amounts,
            decimals,
            settlement_reference,
        )
    }
}
