// Every figure and link here is real and independently checkable — see README.md and demo/ in
// the repo root. Nothing on this page is a placeholder; corrections here should always trace back
// to a real, re-runnable command (`pnpm verify <pda>`) or a real Explorer link.

const EXPLORER = (kind: 'address' | 'tx', value: string) =>
  `https://explorer.solana.com/${kind}/${value}?cluster=devnet`;

export const workflows = {
  oneTimeApproval: {
    pda: 'BLNk3YKYy65FQKoBwRR2xQgytZ2ZZ99Phwp6A6ZqEjJr',
    type: 'one-time-approval-gated-transfer',
    explorer: EXPLORER('address', 'BLNk3YKYy65FQKoBwRR2xQgytZ2ZZ99Phwp6A6ZqEjJr'),
  },
  recurringConditional: {
    pda: '43u2XzFUb2yB32Sd83Qad6d8Sz51L4m5z7Tvc6pVoXN8',
    type: 'recurring-conditional-payment',
    explorer: EXPLORER('address', '43u2XzFUb2yB32Sd83Qad6d8Sz51L4m5z7Tvc6pVoXN8'),
  },
} as const;

export const x402Tx = {
  signature:
    'yvbUcYbeGEmENAveeDs1Sveqp2UjMUGN6hhf3XuRDcGHysGdLdiHCfyQ5y6iaCav886AAreXobXyGkxtfz244La',
  explorer: EXPLORER(
    'tx',
    'yvbUcYbeGEmENAveeDs1Sveqp2UjMUGN6hhf3XuRDcGHysGdLdiHCfyQ5y6iaCav886AAreXobXyGkxtfz244La',
  ),
};

export const receiptCnft = {
  assetId: 'CpxvZzxFdb4u7JGiZtHokW4Uerbzcyi1cX5xCqK5ER5d',
  explorer: EXPLORER('address', 'CpxvZzxFdb4u7JGiZtHokW4Uerbzcyi1cX5xCqK5ER5d'),
};

export const settlementSplit = [
  { label: 'vendor, via x402 / PayAI', pct: 85 },
  { label: 'tax reserve', pct: 10 },
  { label: 'yield pool', pct: 5 },
] as const;

export const proofStats = [
  { value: 130, suffix: '', label: 'Real workflow executions, 5→25→50→50 concurrency ramp' },
  { value: 100, suffix: '%', label: 'Transaction success rate' },
  { value: 0, suffix: '', label: 'Crashes' },
  { value: 8, suffix: '', label: 'Attack classes in the deep security-diagnosis pass' },
  { value: 3, suffix: '', label: 'Live prompt-injection attempts against the running agent — all resisted' },
  { value: 9, suffix: '+', label: 'Real bugs found and fixed during integration hardening' },
] as const;

export const architectureLayers = [
  {
    icon: 'bot',
    title: 'AI agent — advisory only',
    body: 'Watches for triggers, decides what to do next. Zero signing authority.',
  },
  {
    icon: 'shield-check',
    title: 'On-chain hard checks',
    body: 'Compliance, spend caps, recipient allowlists. The AI cannot override these — ever.',
  },
  {
    icon: 'users',
    title: 'Human multisig — Squads',
    body: 'Anything past a limit pauses and pings the real owner. Not a rubber stamp.',
  },
] as const;

export const howItWorks = [
  {
    n: '01',
    title: 'Compile',
    body: 'One plain-English instruction becomes a fixed, unchangeable on-chain program. Once compiled, nothing — not even the AI — can talk it out of its steps.',
  },
  {
    n: '02',
    title: 'Advise, never sign',
    body: 'An AI agent watches for triggers and decides what happens next — but holds zero signing authority. Restricted to 4 narrow typed tools, it cannot move money on its own, even if fully manipulated.',
  },
  {
    n: '03',
    title: 'Hard checks',
    body: 'Every step runs through on-chain checks the AI cannot override: compliance, spend caps, recipient allowlists. Anything that fails is rejected and logged — even if the AI itself seemed to agree.',
  },
  {
    n: '04',
    title: 'Pause for a human',
    body: 'A legitimate request that exceeds a limit pings the real owner through an actual Squads multisig treasury. Not a rubber stamp — a real signer, in the loop.',
  },
  {
    n: '05',
    title: 'Settle',
    body: 'Payment settles for real through x402, authorized by a signed AP2 mandate, split automatically across destinations, priced with live Pyth data.',
  },
  {
    n: '06',
    title: 'Prove',
    body: 'Every single step writes its own signed, cryptographic proof on-chain — not just a final "paid" flag. A full trail, permanent and public.',
  },
  {
    n: '07',
    title: 'Verify independently',
    body: 'A tool anyone can run — no login, no access to Ashlar’s systems — re-fetches the real blockchain history and re-derives every proof itself.',
  },
  {
    n: '08',
    title: 'Receipt',
    body: 'A receipt mints as an actual compressed NFT, straight into the owner’s wallet.',
  },
] as const;

export const verifyCommand = `pnpm verify ${workflows.oneTimeApproval.pda}`;

// The live dashboard (@ashlar/dashboard) is a separate app/port — dev default matches its own
// vite.config.ts. Override via VITE_DASHBOARD_URL for a non-local deployment.
export const dashboardUrl = import.meta.env.VITE_DASHBOARD_URL ?? 'http://localhost:5173';

// The system underneath the settlement most visitors see — six real, independently-shippable
// subsystems, not one script. Each maps to an actual package/program in the repo.
export const stackPillars = [
  {
    icon: 'file-code-2',
    name: 'Compiler',
    tagline: 'English → compiled workflow',
    body: 'A deterministic rule-based compiler turns a plain-English instruction into a fixed CompiledWorkflow — two structurally different templates, one engine, zero LLM involved in this step.',
    tags: ['@ashlar/compiler', 'TypeScript'],
  },
  {
    icon: 'link-2',
    name: 'On-chain policy engine',
    tagline: 'Anchor program on Solana',
    body: 'Six instructions enforce the compiled step sequence in order — fetch, compliance/approval, guardrail, settlement, resume-after-override — each writing its own signed Attestation and Ledger entry.',
    tags: ['Anchor', 'Rust', 'Solana devnet'],
  },
  {
    icon: 'bot',
    name: 'AI reasoning layer',
    tagline: 'Claude, boxed to 5 typed tools',
    body: 'A real Claude tool-use loop drives the workflow forward. Its entire action space is 5 narrow, schema-constrained tools — it can request a step, never construct a transaction.',
    tags: ['Claude API', 'Anthropic SDK'],
  },
  {
    icon: 'shield-half',
    name: 'Treasury custody',
    tagline: 'Real 2-of-2 Squads multisig',
    body: 'Overrides on a paused, over-cap request execute through an actual Squads propose → approve → execute flow — not a program-owned vault.',
    tags: ['Squads v4', '@sqds/multisig'],
  },
  {
    icon: 'shuffle',
    name: 'Settlement rails',
    tagline: 'Real external protocols, wired in',
    body: 'Live Pyth pricing, a signed AP2 payment mandate, an x402 payment settled through PayAI’s public facilitator, and a compressed-NFT receipt minted to Arweave via Irys.',
    tags: ['x402', 'AP2', 'Pyth', 'Bubblegum', 'Irys'],
  },
  {
    icon: 'search-check',
    name: 'Independent verification',
    tagline: 'Zero shared code with the app',
    body: 'A standalone CLI and a live SSE dashboard re-fetch raw chain history and re-derive every proof from the public IDL alone — never trusting Ashlar’s own client code.',
    tags: ['Verifier CLI', 'Live dashboard'],
  },
] as const;

export const techStack = [
  'Solana',
  'Anchor',
  'Claude',
  'Squads',
  'x402',
  'AP2',
  'Pyth',
  'Metaplex Bubblegum',
  'Irys / Arweave',
  'Helius',
  'React',
  'Vite',
] as const;
