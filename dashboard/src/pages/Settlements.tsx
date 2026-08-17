import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { CircleAlert, ExternalLink, Receipt } from 'lucide-react';
import {
  explorerAddress,
  explorerTx,
  RELAY_URL,
  short,
  workflowIdToDate,
  type DirectTransferEvidence,
  type SettlementEvidence,
  type VendorSplitSettlementEvidence,
} from '../types.js';
import { EmptyState } from '../components/EmptyState.js';
import { SkeletonRows } from '../components/Skeleton.js';
import { useLiveEvents } from '../hooks/useLiveEvents.js';

const segColors = ['bg-(--color-ink)', 'bg-(--color-accent)', 'bg-[#d7d1bd]', 'bg-[#8c6a30]'];

function usdc(atomic: string): string {
  return (Number(atomic) / 1_000_000).toFixed(2);
}

function VendorSplitCard({ s, i }: { s: VendorSplitSettlementEvidence; i: number }) {
  const split = [
    { label: 'vendor, via x402 / PayAI', atomic: s.splits.vendorUsdcAtomic },
    { label: 'tax reserve', atomic: s.splits.taxReserveUsdcAtomic },
    { label: 'yield pool', atomic: s.splits.yieldPoolUsdcAtomic },
  ];
  const total = split.reduce((sum, seg) => sum + Number(seg.atomic), 0);
  return (
    <>
      <div className="flex w-full h-6 rounded-md overflow-hidden border border-(--color-hairline) mb-2.5">
        {split.map((seg, j) => (
          <motion.div
            key={seg.label}
            initial={{ width: 0 }}
            animate={{ width: `${(Number(seg.atomic) / total) * 100}%` }}
            transition={{ duration: 0.5, delay: Math.min(i, 6) * 0.05 + j * 0.08 }}
            className={segColors[j]}
          />
        ))}
      </div>
      <div className="flex gap-4 text-[12px] mb-3 flex-wrap">
        {split.map((seg, j) => (
          <span key={seg.label} className="inline-flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full shrink-0 ${segColors[j]}`} />
            <span className="font-mono">${usdc(seg.atomic)}</span>
            <span className="text-(--color-mist)">{seg.label}</span>
          </span>
        ))}
      </div>

      <div className="flex gap-4 pt-3 border-t border-(--color-hairline) text-[12.5px]">
        <a
          href={explorerTx(s.taxReserveTransferSignature)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 font-medium text-(--color-accent) hover:text-(--color-accent-hover)"
        >
          Tax-reserve tx <ExternalLink className="w-3.5 h-3.5" />
        </a>
        <a
          href={explorerTx(s.yieldPoolTransferSignature)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 font-medium text-(--color-accent) hover:text-(--color-accent-hover)"
        >
          Yield-pool tx <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
    </>
  );
}

function DirectTransferCard({ s, i }: { s: DirectTransferEvidence; i: number }) {
  const total = s.legs.reduce((sum, leg) => sum + Number(leg.usdcAtomic), 0);
  return (
    <>
      <div className="flex w-full h-6 rounded-md overflow-hidden border border-(--color-hairline) mb-2.5">
        {s.legs.map((leg, j) => (
          <motion.div
            key={leg.recipient}
            initial={{ width: 0 }}
            animate={{ width: `${(Number(leg.usdcAtomic) / total) * 100}%` }}
            transition={{ duration: 0.5, delay: Math.min(i, 6) * 0.05 + j * 0.08 }}
            className={segColors[j % segColors.length]}
          />
        ))}
      </div>
      <div className="flex flex-col gap-2">
        {s.legs.map((leg, j) => (
          <div key={leg.recipient} className="flex items-center justify-between gap-2 text-[12px] flex-wrap">
            <span className="inline-flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full shrink-0 ${segColors[j % segColors.length]}`} />
              <span className="font-mono">${usdc(leg.usdcAtomic)}</span>
              <span className="text-(--color-mist)">to</span>
              <a
                href={explorerAddress(leg.recipient)}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-(--color-accent) hover:text-(--color-accent-hover)"
              >
                {short(leg.recipient)}
              </a>
            </span>
            <a
              href={explorerTx(leg.signature)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-(--color-accent) hover:text-(--color-accent-hover)"
            >
              tx <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        ))}
      </div>
    </>
  );
}

export function Settlements() {
  const [settlements, setSettlements] = useState<SettlementEvidence[] | null>(null);
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

  function load(silent = false) {
    if (!silent) setStatus('loading');
    fetch(`${RELAY_URL}/settlements`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`relay returned ${res.status}`);
        return res.json() as Promise<{ settlements: SettlementEvidence[] }>;
      })
      .then((d) => {
        const sorted = [...d.settlements].sort((a, b) => Number(b.workflowId) - Number(a.workflowId));
        setSettlements(sorted);
        setStatus('loaded');
      })
      .catch((err: Error) => {
        setError(err.message);
        setStatus('error');
      });
  }

  useEffect(load, []);
  // Real-time: a new settlement lands here live the moment the agent completes one, anywhere.
  useLiveEvents(() => load(true));

  if (status === 'loading') return <SkeletonRows count={3} />;
  if (status === 'error') {
    return (
      <p className="text-[13.5px] text-red-700 flex items-center gap-1.5">
        <CircleAlert className="w-4 h-4 shrink-0" /> {error}
      </p>
    );
  }
  if (!settlements || settlements.length === 0) {
    return (
      <EmptyState
        icon={Receipt}
        title="No settlements yet"
        body="This fills in the moment a workflow actually settles for real."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[12.5px] text-(--color-mist)">
        {settlements.length} real settlement{settlements.length === 1 ? '' : 's'} — read directly
        from <span className="font-mono">treasury/settlements/</span>, not a database.
      </p>
      {settlements.map((s, i) => {
        return (
          <motion.section
            key={s.workflowId}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: Math.min(i, 8) * 0.05 }}
            className="rounded-xl border border-(--color-hairline) bg-white p-5 transition-shadow hover:shadow-md"
          >
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div>
                <p className="font-semibold text-[14px] m-0">
                  ${s.totalAmountUsd} at ${s.usdcUsdPrice.toFixed(4)}/USDC
                </p>
                <p className="text-[11.5px] text-(--color-mist) m-0 font-mono">
                  workflow {s.workflowId} · {workflowIdToDate(s.workflowId).toLocaleString()}
                </p>
              </div>
              <span className="text-[10.5px] font-semibold rounded-full px-2 py-0.5 bg-(--color-surface) text-(--color-mist)">
                {s.kind === 'direct-transfer'
                  ? `direct transfer, ${s.legs.length} recipient${s.legs.length === 1 ? '' : 's'}`
                  : 'vendor split'}
              </span>
            </div>

            {s.kind === 'direct-transfer' ? <DirectTransferCard s={s} i={i} /> : <VendorSplitCard s={s} i={i} />}
          </motion.section>
        );
      })}
    </div>
  );
}
