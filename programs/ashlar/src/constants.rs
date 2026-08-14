use anchor_lang::prelude::*;

#[constant]
pub const COUNTER_SEED: &[u8] = b"counter";

#[constant]
pub const HELLO_WORLD_LAMPORTS: u64 = 1;

#[constant]
pub const MAX_COUNT: u64 = 10;

#[constant]
pub const WORKFLOW_SEED: &[u8] = b"workflow";

#[constant]
pub const ATTESTATION_SEED: &[u8] = b"attestation";

#[constant]
pub const LEDGER_SEED: &[u8] = b"ledger";

#[constant]
pub const VAULT_SEED: &[u8] = b"vault";

/// Fixed gate sequence length for every workflow: fetch, compliance/approval, guardrail, settlement.
/// Kept as a plain Rust const (not `#[constant]`/IDL-exposed, since `usize` isn't a stable IDL
/// type) and mirrored as a literal in `#[max_len(4)]` attributes in state.rs, since that macro
/// needs a literal at derive time.
pub const MAX_STEPS: usize = 4;

pub const MAX_ALLOWLIST: usize = 4;
