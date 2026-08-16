import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { CheckCircle2, ExternalLink, Loader2 } from 'lucide-react';
import { explorerTx, RELAY_URL, type SettlementEvidence } from '../types.js';

const segColors = ['bg-(--color-ink)', 'bg-(--color-accent)', 'bg-[#d7d1bd]'];

function usdc(atomic: string): string {
  return (Number(atomic) / 1_000_000).toFixed(2);
}

interface SettlementProps {
  watchedWorkflow: string | null;
  workflowId: string | null;
}

export function Settlement({ watchedWorkflow, workflowId }: SettlementProps) {
  const [evidence, setEvidence] = useState<SettlementEvidence | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'found' | 'not-found' | 'error'>('idle');

  useEffect(() => {
    if (!workflowId) {
      setEvidence(null);
      setStatus('idle');
      return;
    }
    setStatus('loading');
    setEvidence(null);
    fetch(`${RELAY_URL}/settlement/${workflowId}`)
      .then(async (res) => {
        if (res.status === 404) {
          setStatus('not-found');
          return;
        }
        if (!res.ok) throw new Error(`relay returned ${res.status}`);
        setEvidence((await res.json()) as SettlementEvidence);
        setStatus('found');
      })
      .catch(() => setStatus('error'));
  }, [workflowId]);

  if (!watchedWorkflow) {
    return (
      <section className="rounded-xl border border-(--color-hairline) bg-white p-5">
        <p className="text-[13.5px] text-(--color-mist) m-0">
          Watch a workflow on the Workflows tab first — its real settlement evidence, if any,
          shows up here.
        </p>
      </section>
    );
  }

  if (status === 'idle' || status === 'loading') {
    return (
      <section className="rounded-xl border border-(--color-hairline) bg-white p-5">
        <p className="text-[13.5px] text-(--color-mist) m-0 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading settlement…
        </p>
      </section>
    );
  }

  if (status === 'not-found') {
    return (
      <section className="rounded-xl border border-(--color-hairline) bg-white p-5">
        <p className="text-[13.5px] text-(--color-mist) m-0">
          No settlement recorded for this workflow yet — it hasn't settled (still in progress,
          paused, or rejected before reaching that step).
        </p>
      </section>
    );
  }

  if (status === 'error' || !evidence) {
    return (
      <section className="rounded-xl border border-(--color-hairline) bg-white p-5">
        <p className="text-[13.5px] text-red-700 m-0">Couldn't load settlement evidence.</p>
      </section>
    );
  }

  const split = [
    { label: 'vendor, via x402 / PayAI', atomic: evidence.splits.vendorUsdcAtomic },
    { label: 'tax reserve', atomic: evidence.splits.taxReserveUsdcAtomic },
    { label: 'yield pool', atomic: evidence.splits.yieldPoolUsdcAtomic },
  ];
  const total = split.reduce((sum, s) => sum + Number(s.atomic), 0);

  return (
    <section className="rounded-xl border border-(--color-hairline) bg-white p-5">
      <div className="flex items-center gap-2.5 mb-4">
        <CheckCircle2 className="w-5 h-5 text-(--color-accent)" />
        <h2 className="font-semibold text-[15px] m-0">
          Settled — ${evidence.totalAmountUsd} at ${evidence.usdcUsdPrice.toFixed(4)}/USDC
        </h2>
      </div>

      <div className="flex w-full h-8 rounded-md overflow-hidden border border-(--color-hairline) mb-3">
        {split.map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ width: 0 }}
            animate={{ width: `${(Number(s.atomic) / total) * 100}%` }}
            transition={{ duration: 0.6, delay: i * 0.1 }}
            className={segColors[i]}
          />
        ))}
      </div>
      <div className="grid sm:grid-cols-3 gap-3 text-[12.5px] mb-5">
        {split.map((s, i) => (
          <div key={s.label} className="flex items-baseline gap-1.5">
            <span className={`w-2 h-2 rounded-full shrink-0 ${segColors[i]}`} />
            <span className="font-mono">${usdc(s.atomic)}</span>
            <span className="text-(--color-mist)">{s.label}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-1.5 pt-4 border-t border-(--color-hairline) text-[13px]">
        <a
          href={explorerTx(evidence.taxReserveTransferSignature)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 font-medium text-(--color-accent) hover:text-(--color-accent-hover) w-fit"
        >
          Tax-reserve transfer <ExternalLink className="w-3.5 h-3.5" />
        </a>
        <a
          href={explorerTx(evidence.yieldPoolTransferSignature)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 font-medium text-(--color-accent) hover:text-(--color-accent-hover) w-fit"
        >
          Yield-pool transfer <ExternalLink className="w-3.5 h-3.5" />
        </a>
        <p className="text-[12px] text-(--color-mist) mt-1 mb-0">
          AP2 mandate: {evidence.ap2Mandate.verified ? 'verified' : 'unverified'} · Agent identity:{' '}
          {evidence.agentIdentity.registered ? 'registered' : 'not registered'}
        </p>
      </div>
    </section>
  );
}
