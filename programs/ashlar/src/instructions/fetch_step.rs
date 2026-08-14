use anchor_lang::prelude::*;

use super::shared::attest_and_log;
use crate::{constants::*, error::ErrorCode, state::*};

#[derive(Accounts)]
#[instruction(workflow_id: u64)]
pub struct FetchStep<'info> {
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

pub fn handle_fetch_step(ctx: Context<FetchStep>, _workflow_id: u64, invoice_id: u64, amount: u64) -> Result<()> {
    let workflow = &mut ctx.accounts.workflow;
    require!(
        workflow.status == WorkflowStatus::InProgress,
        ErrorCode::WorkflowNotInProgress
    );
    require!(
        workflow.steps.get(workflow.current_step as usize) == Some(&StepKind::Fetch),
        ErrorCode::OutOfOrderStep
    );

    let clock = Clock::get()?;
    let mut data = invoice_id.to_le_bytes().to_vec();
    data.extend_from_slice(&amount.to_le_bytes());

    attest_and_log(
        &mut ctx.accounts.attestation,
        &mut ctx.accounts.ledger,
        workflow.key(),
        workflow.current_step,
        StepKind::Fetch,
        ctx.accounts.owner.key(),
        AttestationOutcome::Passed,
        &data,
        clock.unix_timestamp,
    )?;

    workflow.current_step += 1;
    msg!("Fetch step recorded for invoice {}, amount {}", invoice_id, amount);
    Ok(())
}
