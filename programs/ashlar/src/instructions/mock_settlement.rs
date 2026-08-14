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
    #[account(
        mut,
        seeds = [VAULT_SEED, workflow.key().as_ref()],
        bump = workflow.vault_bump,
    )]
    pub vault: SystemAccount<'info>,
    /// CHECK: the recipient recorded by `guardrail_check`; validated below against
    /// `workflow.pending_recipient` rather than via an Anchor account constraint.
    #[account(mut)]
    pub recipient: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

pub fn handle_mock_settlement(ctx: Context<MockSettlement>, _workflow_id: u64) -> Result<()> {
    let workflow = &mut ctx.accounts.workflow;
    require!(
        workflow.status == WorkflowStatus::InProgress,
        ErrorCode::WorkflowNotInProgress
    );
    require!(
        workflow.steps.get(workflow.current_step as usize) == Some(&StepKind::MockSettlement),
        ErrorCode::OutOfOrderStep
    );
    require_keys_eq!(
        ctx.accounts.recipient.key(),
        workflow.pending_recipient,
        ErrorCode::RecipientMismatch
    );

    let workflow_key = workflow.key();
    let vault_bump = workflow.vault_bump;
    let amount = workflow.pending_amount;

    let seeds: &[&[u8]] = &[VAULT_SEED, workflow_key.as_ref(), &[vault_bump]];
    let signer_seeds: &[&[&[u8]]] = &[seeds];

    let cpi_accounts = anchor_lang::system_program::Transfer {
        from: ctx.accounts.vault.to_account_info(),
        to: ctx.accounts.recipient.to_account_info(),
    };
    let cpi_ctx = CpiContext::new_with_signer(
        anchor_lang::system_program::ID,
        cpi_accounts,
        signer_seeds,
    );
    anchor_lang::system_program::transfer(cpi_ctx, amount)?;

    let clock = Clock::get()?;
    let mut data = amount.to_le_bytes().to_vec();
    data.extend_from_slice(ctx.accounts.recipient.key().as_ref());

    attest_and_log(
        &mut ctx.accounts.attestation,
        &mut ctx.accounts.ledger,
        workflow_key,
        workflow.current_step,
        StepKind::MockSettlement,
        ctx.accounts.owner.key(),
        AttestationOutcome::Executed,
        &data,
        clock.unix_timestamp,
    )?;

    workflow.current_step += 1;
    workflow.status = WorkflowStatus::Completed;
    msg!("Mock settlement executed: {} lamports to {}", amount, ctx.accounts.recipient.key());
    Ok(())
}
