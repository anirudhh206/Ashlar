use anchor_lang::prelude::*;
use anchor_spl::token::{transfer_checked, Token, TransferChecked};

use super::shared::attest_and_log;
use crate::{constants::*, error::ErrorCode, state::*};

#[derive(Accounts)]
#[instruction(workflow_id: u64)]
pub struct SettleDirectTransfer<'info> {
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
    /// CHECK: read by the transfer_checked CPI itself, which fails if this isn't a real SPL mint.
    pub mint: UncheckedAccount<'info>,
    /// CHECK: must be the owner's own token account for `mint` — the transfer_checked CPI fails
    /// otherwise, since `owner` is the required signing authority for every leg.
    #[account(mut)]
    pub owner_token_account: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

/// Real fund movement, on-chain: a plain SPL `transfer_checked` CPI per recipient, straight from
/// the Anchor program — not a TypeScript script run beforehand. `remaining_accounts` carries each
/// recipient's token account (1–4 of them, mirroring the workflow's `allowlist` bound); `amounts`
/// gives each leg's atomic USDC amount, computed off-chain from a live Pyth price (bringing Pyth
/// itself on-chain would need a separate pull-oracle integration — out of scope here, so the price
/// lookup stays off-chain while the money movement it produces does not).
///
/// Every recipient's token-account *owner* (the wallet that can spend from it, read directly out
/// of the account's raw bytes via `accessor::authority`, not trusted from the caller) must already
/// be on `workflow.allowlist` — set once, at `initialize_workflow`, and immutable after. This is
/// the same allowlist `guardrail_check` partially validated earlier (only the first recipient,
/// since that instruction only takes one `Pubkey`); checking every recipient here, inside the
/// program itself, is what makes this an enforced on-chain guarantee rather than something the
/// off-chain harness merely promises to have checked first.
///
/// Because the transfer and the attestation are one instruction, they're atomic: either every leg
/// lands and the workflow completes, or the whole transaction reverts and nothing moves — there is
/// no way to end up with some money sent and no on-chain record of it, unlike an off-chain script
/// that could crash between its second and third transfer.
pub fn handle_settle_direct_transfer<'info>(
    ctx: Context<'info, SettleDirectTransfer<'info>>,
    _workflow_id: u64,
    amounts: Vec<u64>,
    decimals: u8,
    settlement_reference: String,
) -> Result<()> {
    let recipients = ctx.remaining_accounts;
    require!(
        !recipients.is_empty() && recipients.len() <= MAX_ALLOWLIST && recipients.len() == amounts.len(),
        ErrorCode::InvalidRecipientCount
    );

    {
        let workflow = &ctx.accounts.workflow;
        require!(
            workflow.status == WorkflowStatus::InProgress,
            ErrorCode::WorkflowNotInProgress
        );
        require!(
            workflow.steps.get(workflow.current_step as usize) == Some(&StepKind::MockSettlement),
            ErrorCode::OutOfOrderStep
        );
    }

    let mut total: u64 = 0;
    let mut data = Vec::new();
    for (recipient_ata, &amount) in recipients.iter().zip(amounts.iter()) {
        let ata_owner = anchor_spl::token::accessor::authority(recipient_ata)?;
        require!(
            ctx.accounts.workflow.allowlist.contains(&ata_owner),
            ErrorCode::RecipientNotAllowlisted
        );
        let ata_mint = anchor_spl::token::accessor::mint(recipient_ata)?;
        require!(ata_mint == ctx.accounts.mint.key(), ErrorCode::InvalidMint);

        transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.key(),
                TransferChecked {
                    from: ctx.accounts.owner_token_account.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    to: recipient_ata.clone(),
                    authority: ctx.accounts.owner.to_account_info(),
                },
            ),
            amount,
            decimals,
        )?;

        total = total.checked_add(amount).ok_or(ErrorCode::AmountOverflow)?;
        data.extend_from_slice(ata_owner.as_ref());
        data.extend_from_slice(&amount.to_le_bytes());
    }
    data.extend_from_slice(settlement_reference.as_bytes());

    let clock = Clock::get()?;
    let workflow = &mut ctx.accounts.workflow;
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
        "Direct transfer settled on-chain: {} recipients, {} total atomic units ({})",
        recipients.len(),
        total,
        settlement_reference
    );
    Ok(())
}
