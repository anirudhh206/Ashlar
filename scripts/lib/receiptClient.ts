/**
 * Phase 7 — mints the final workflow-completion receipt as a compressed NFT into the Business
 * Owner's wallet, grouped under the shared "Ashlar Receipts" collection (see
 * scripts/devnet/setup-receipt-collection.ts). Metadata is uploaded to real Arweave/Irys storage
 * (not a data: URI) since this is the one piece of Phase 5-7 metadata explicitly meant to be
 * seen by a human in Phantom/Explorer. Zero changes to programs/ashlar — Bubblegum is Metaplex's
 * own deployed program; minting is a pure client-side side effect after mock_settlement lands.
 */
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { keypairIdentity, publicKey, type PublicKey as UmiPublicKey, type Umi } from '@metaplex-foundation/umi';
import { irysUploader } from '@metaplex-foundation/umi-uploader-irys';
import { mplBubblegum, mintToCollectionV1, parseLeafFromMintToCollectionV1Transaction, findLeafAssetIdPda } from '@metaplex-foundation/mpl-bubblegum';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import bs58 from 'bs58';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const COLLECTION_CONFIG_PATH = path.join(REPO_ROOT, 'treasury', 'receipt-collection.json');
const DEVNET_URL = 'https://api.devnet.solana.com';

export function createReceiptUmi(secretKey: Uint8Array): Umi {
  const umi = createUmi(DEVNET_URL).use(irysUploader());
  const umiKeypair = umi.eddsa.createKeypairFromSecretKey(secretKey);
  return umi.use(keypairIdentity(umiKeypair, true));
}

export async function uploadReceiptMetadata(umi: Umi, metadata: Record<string, unknown>): Promise<string> {
  return umi.uploader.uploadJson(metadata);
}

interface ReceiptCollectionConfig {
  merkleTree: string;
  collectionMint: string;
}

function loadReceiptCollectionConfig(): ReceiptCollectionConfig {
  return JSON.parse(readFileSync(COLLECTION_CONFIG_PATH, 'utf8')) as ReceiptCollectionConfig;
}

export interface ReceiptResult {
  signature: string;
  assetId: string;
  explorerLink: string;
  metadataUri: string;
}

export async function mintReceipt(
  businessOwnerSecret: Uint8Array,
  workflowId: string,
  evidence: unknown,
): Promise<ReceiptResult> {
  const { merkleTree, collectionMint } = loadReceiptCollectionConfig();
  const umi = createReceiptUmi(businessOwnerSecret).use(mplBubblegum());
  const merkleTreePk: UmiPublicKey = publicKey(merkleTree);
  const collectionMintPk: UmiPublicKey = publicKey(collectionMint);

  const metadataJson = {
    name: `Ashlar Receipt — Workflow ${workflowId}`,
    description:
      'A verifiable completion receipt for an Ashlar workflow. Independently re-check every step: ' +
      `pnpm verify <workflow>`,
    attributes: [
      { trait_type: 'workflowId', value: workflowId },
      { trait_type: 'network', value: 'devnet' },
    ],
    properties: { evidence },
  };
  const metadataUri = await uploadReceiptMetadata(umi, metadataJson);

  const mintBuilder = mintToCollectionV1(umi, {
    leafOwner: umi.identity.publicKey,
    merkleTree: merkleTreePk,
    collectionMint: collectionMintPk,
    metadata: {
      // On-chain Token Metadata name has a strict 32-byte limit (confirmed: MetadataNameTooLong
      // against real devnet with a longer name) — keep it short and fixed; the workflow id lives
      // in the off-chain metadata JSON's attributes instead, which has no such limit.
      name: 'Ashlar Receipt',
      uri: metadataUri,
      sellerFeeBasisPoints: 0,
      collection: { key: collectionMintPk, verified: false },
      creators: [{ address: umi.identity.publicKey, verified: true, share: 100 }],
    },
  });
  const { signature } = await mintBuilder.sendAndConfirm(umi);
  const signatureBase58 = bs58.encode(signature);
  console.log(`[receiptClient] mint tx: ${signatureBase58}`);

  // Immediately after confirmation the RPC may not yet serve this transaction via getTransaction
  // — confirmed empirically this is a real propagation-lag gap (not a code bug): the same lookup
  // against an already-landed signature minutes later succeeds every time. Retry with real budget.
  let leaf: Awaited<ReturnType<typeof parseLeafFromMintToCollectionV1Transaction>> | undefined;
  let lastErr: unknown;
  for (let attempt = 0; attempt < 20 && !leaf; attempt++) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 2000));
    try {
      leaf = await parseLeafFromMintToCollectionV1Transaction(umi, signature);
    } catch (err) {
      lastErr = err;
    }
  }
  if (!leaf) throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));

  const assetId = findLeafAssetIdPda(umi, { merkleTree: merkleTreePk, leafIndex: leaf.nonce });

  return {
    signature: signatureBase58,
    assetId: assetId[0].toString(),
    explorerLink: `https://explorer.solana.com/address/${assetId[0].toString()}?cluster=devnet`,
    metadataUri,
  };
}

/** The "Owner Receives Final Receipt" notification text — shared across every call site that
 * completes a settlement, so the message format stays in one place. */
export function buildReceiptNotification(workflowId: string, receipt: ReceiptResult): string {
  return (
    `Workflow ${workflowId} completed — receipt minted.\n` +
    `Asset: ${receipt.assetId}\n` +
    `${receipt.explorerLink}\n` +
    `View it in Phantom, or via Solana Explorer above.`
  );
}
