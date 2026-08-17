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

/// Records that settlement happened — it does not move funds itself. The actual transfer is
/// executed off-chain, signed by the business-owner wallet, *before* this instruction is called:
/// either a Pyth-priced 85/10/5 vendor/tax-reserve/yield-pool split paid via real x402 rails (see
/// scripts/lib/splitSettlement.ts), or a direct SPL transfer to one or more explicit recipient
/// wallets for a real-address / group transfer (see scripts/lib/directTransfer.ts). Phase 4's
/// Squads-multisig-held treasury was superseded by this business-owner-signed path — x402
/// payments need a directly-signable payer, which a multisig can't be without deeper Squads
/// integration than this project's scope (see agent/README.md). `settlement_reference` (a JSON
/// blob summarizing the settlement, hashed for evidence) is hashed into this step's Attestation,
/// the same way every other step's instruction-specific data already is.
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
