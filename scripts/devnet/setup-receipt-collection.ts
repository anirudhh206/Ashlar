/**
 * One-time setup: creates the shared compressed-NFT Merkle tree and the "Ashlar Receipts"
 * Collection NFT that every workflow-completion receipt (Phase 7) mints into. Persists
 * { merkleTree, collectionMint } pubkeys to treasury/receipt-collection.json (tracked, no
 * secrets — same pattern as treasury/squads-treasury.json).
 *
 * Usage: pnpm setup-receipt-collection
 */
import { generateSigner, percentAmount } from '@metaplex-foundation/umi';
import { createTree, mplBubblegum } from '@metaplex-foundation/mpl-bubblegum';
import { createNft, mplTokenMetadata } from '@metaplex-foundation/mpl-token-metadata';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createReceiptUmi, uploadReceiptMetadata } from '../lib/receiptClient.js';
import bs58 from 'bs58';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const WALLET_PATH = path.join(REPO_ROOT, 'wallets', 'business-owner.json');
const OUTPUT_PATH = path.join(REPO_ROOT, 'treasury', 'receipt-collection.json');

async function main(): Promise<void> {
  if (existsSync(OUTPUT_PATH)) {
    console.log(`${OUTPUT_PATH} already exists — nothing to do. Delete it to recreate.`);
    return;
  }

  const secret = JSON.parse(readFileSync(WALLET_PATH, 'utf8')) as number[];
  const umi = createReceiptUmi(Uint8Array.from(secret)).use(mplBubblegum()).use(mplTokenMetadata());

  console.log('Creating Merkle tree...');
  const merkleTree = generateSigner(umi);
  const createTreeBuilder = await createTree(umi, {
    merkleTree,
    maxDepth: 14,
    maxBufferSize: 64,
  });
  const treeResult = await createTreeBuilder.sendAndConfirm(umi);
  console.log(`Tree created: ${merkleTree.publicKey}`);
  console.log(`  tx: ${bs58.encode(treeResult.signature)}`);

  console.log('Creating "Ashlar Receipts" collection NFT...');
  const collectionUri = await uploadReceiptMetadata(umi, {
    name: 'Ashlar Receipts',
    description: 'Verifiable completion receipts for Ashlar workflows — each one a compressed NFT proof that a workflow ran through every guardrail and settled for real. See the workflow ID in each receipt and run `pnpm verify <workflow>` to independently re-check it.',
    image: undefined,
  });
  const collectionMint = generateSigner(umi);
  const createNftBuilder = createNft(umi, {
    mint: collectionMint,
    name: 'Ashlar Receipts',
    uri: collectionUri,
    sellerFeeBasisPoints: percentAmount(0),
    isMutable: true,
    collectionDetails: { __kind: 'V1', size: 0 },
  });
  const nftResult = await createNftBuilder.sendAndConfirm(umi);
  console.log(`Collection NFT created: ${collectionMint.publicKey}`);
  console.log(`  tx: ${bs58.encode(nftResult.signature)}`);

  mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(
    OUTPUT_PATH,
    JSON.stringify(
      { network: 'devnet', merkleTree: merkleTree.publicKey, collectionMint: collectionMint.publicKey },
      null,
      2,
    ) + '\n',
  );
  console.log(`Wrote ${OUTPUT_PATH}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
