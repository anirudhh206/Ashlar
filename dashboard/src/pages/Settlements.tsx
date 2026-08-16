import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { CircleAlert, ExternalLink, Loader2 } from 'lucide-react';
import { explorerTx, RELAY_URL, workflowIdToDate, type SettlementEvidence } from '../types.js';

const segColors = ['bg-(--color-ink)', 'bg-(--color-accent)', 'bg-[#d7d1bd]'];

function usdc(atomic: string): string {
  return (Number(atomic) / 1_000_000).toFixed(2);
}

export function Settlements() {
  const [settlements, setSettlements] = useState<SettlementEvidence[] | null>(null);
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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
  }, []);

  if (status === 'loading') {
    return (
      <p className="text-[13.5px] text-(--color-mist) flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading real settlement records…
      </p>
    );
  }
  if (status === 'error') {
    return (
      <p className="text-[13.5px] text-red-700 flex items-center gap-1.5">
        <CircleAlert className="w-4 h-4 shrink-0" /> {error}
      </p>
    );
  }
  if (!settlements || settlements.length === 0) {
    return (
      <section className="rounded-xl border border-(--color-hairline) bg-white p-5">
        <p className="text-[13.5px] text-(--color-mist) m-0">
          No settlements recorded yet — this fills in the moment a workflow actually settles for
          real.
        </p>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[12.5px] text-(--color-mist)">
        {settlements.length} real settlement{settlements.length === 1 ? '' : 's'} — read directly
        from <span className="font-mono">treasury/settlements/</span>, not a database.
      </p>
      {settlements.map((s, i) => {
        const split = [
          { label: 'vendor, via x402 / PayAI', atomic: s.splits.vendorUsdcAtomic },
          { label: 'tax reserve', atomic: s.splits.taxReserveUsdcAtomic },
          { label: 'yield pool', atomic: s.splits.yieldPoolUsdcAtomic },
        ];
        const total = split.reduce((sum, seg) => sum + Number(seg.atomic), 0);
        return (
          <section key={s.workflowId} className="rounded-xl border border-(--color-hairline) bg-white p-5">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div>
                <p className="font-semibold text-[14px] m-0">
                  ${s.totalAmountUsd} at ${s.usdcUsdPrice.toFixed(4)}/USDC
                </p>
                <p className="text-[11.5px] text-(--color-mist) m-0 font-mono">
                  workflow {s.workflowId} · {workflowIdToDate(s.workflowId).toLocaleString()}
                </p>
              </div>
            </div>

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
          </section>
        );
      })}
    </div>
  );
}
