use anchor_lang::prelude::*;

use super::shared::attest_and_log;
use crate::{constants::*, error::ErrorCode, state::*};

#[derive(Accounts)]
#[instruction(workflow_id: u64)]
pub struct MockSettlement<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        mut,
        has_one = owner,
        seeds = [WORKFLOW_SEED, owner.key().as_ref(), &workflow_id.to_le_bytes()],
        bump = workflow.bump,
    )]
    pub workflow: Account<'info, WorkflowInstance>,
    #[account(
        init,
        payer = owner,
        space = 8 + Attestation::INIT_SPACE,
        seeds = [ATTESTATION_SEED, workflow.key().as_ref(), &[workflow.current_step]],
        bump
    )]
    pub attestation: Account<'info, Attestation>,
    #[account(mut, seeds = [LEDGER_SEED, workflow.key().as_ref()], bump)]
    pub ledger: Account<'info, Ledger>,
    pub system_program: Program<'info, System>,
}

/// Records that settlement happened — it does not move funds itself. Real custody now lives in
/// a Squads multisig vault (Phase 4), which only the Squads program can sign for; the actual
/// transfer is executed off-chain via Squads' propose/approve/execute flow (see
/// scripts/lib/squadsClient.ts) *before* this instruction is called. `settlement_reference` (the
/// Squads execution tx signature) is hashed into this step's Attestation as evidence, the same
/// way every other step's instruction-specific data already is.
pub fn handle_mock_settlement(
    ctx: Context<MockSettlement>,
    _workflow_id: u64,
    settlement_reference: String,
) -> Result<()> {
    let workflow = &mut ctx.accounts.workflow;
    require!(
        workflow.status == WorkflowStatus::InProgress,
        ErrorCode::WorkflowNotInProgress
    );
    require!(
        workflow.steps.get(workflow.current_step as usize) == Some(&StepKind::MockSettlement),
        ErrorCode::OutOfOrderStep
    );

    let clock = Clock::get()?;
    let amount = workflow.pending_amount;
    let mut data = amount.to_le_bytes().to_vec();
    data.extend_from_slice(workflow.pending_recipient.as_ref());
    data.extend_from_slice(settlement_reference.as_bytes());

    attest_and_log(
        &mut ctx.accounts.attestation,
        &mut ctx.accounts.ledger,
        workflow.key(),
        workflow.current_step,
        StepKind::MockSettlement,
        ctx.accounts.owner.key(),
        AttestationOutcome::Executed,
        &data,
        clock.unix_timestamp,
    )?;

    workflow.current_step += 1;
    workflow.status = WorkflowStatus::Completed;
    msg!(
        "Settlement attested: {} lamports to {} (Squads tx {})",
        amount,
        workflow.pending_recipient,
        settlement_reference
    );
    Ok(())
}
