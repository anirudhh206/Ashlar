/** Circle's official devnet USDC mint. Funding requires https://faucet.circle.com (human action item). */
export const USDC_DEVNET_MINT = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
export const USDC_DECIMALS = 6;

/** The free public devnet RPC (`api.devnet.solana.com`) aggressively rate-limits — it can't
 * sustain even modest real concurrency (confirmed: ~30 simultaneous calls triggers hard 429s).
 * Prefer HELIUS_RPC_URL when configured (see .env.example); every devnet script/client in this
 * repo should import DEVNET_URL from here rather than hardcoding the public endpoint. */
export const DEVNET_URL = process.env.HELIUS_RPC_URL || 'https://api.devnet.solana.com';
