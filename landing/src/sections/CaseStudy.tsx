import { CheckCircle2, ExternalLink } from 'lucide-react';
import { motion, useInView } from 'motion/react';
import { useRef } from 'react';
import { Reveal } from '../components/Reveal';
import { receiptCnft, settlementSplit, workflows, x402Tx } from '../lib/facts';

const segColors = ['bg-(--color-ink)', 'bg-(--color-accent)', 'bg-[#cfc6ae]'];
const dotColors = ['bg-(--color-ink)', 'bg-(--color-accent)', 'bg-[#cfc6ae]'];

export function CaseStudy() {
  const cardRef = useRef<HTMLDivElement>(null);
  const inView = useInView(cardRef, { once: true, amount: 0.4 });

  return (
    <section id="case" className="max-w-[1200px] mx-auto px-6 sm:px-10 py-24">
      <span className="block text-[13px] tracking-[0.08em] uppercase text-(--color-accent) font-semibold mb-5">
        One real settlement
      </span>
      <Reveal>
        <h2 className="font-extrabold text-[clamp(28px,3.4vw,42px)] tracking-tight max-w-[26ch] mb-12">
          End to end, on-chain, and verified afterward.
        </h2>
      </Reveal>

      <div
        ref={cardRef}
        className="rounded-3xl bg-(--color-surface) border border-(--color-hairline) p-6 sm:p-11 transition-shadow hover:shadow-xl"
      >
        <div className="flex justify-between items-start flex-wrap gap-4 mb-8">
          <div>
            <p className="text-xs tracking-wide uppercase text-(--color-mist) mb-1.5">Workflow</p>
            <a
              href={workflows.oneTimeApproval.explorer}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-sm break-all max-w-[46ch] inline-flex items-center gap-1.5 hover:text-(--color-accent)"
            >
              {workflows.oneTimeApproval.pda}
              <ExternalLink className="w-3.5 h-3.5 shrink-0" />
            </a>
          </div>
          <motion.span
            initial={{ scale: 0.7, opacity: 0 }}
            animate={inView ? { scale: 1, opacity: 1 } : {}}
            transition={{ duration: 0.5, ease: 'backOut' }}
            className="inline-flex items-center gap-1.5 rounded-full bg-(--color-accent-soft) text-(--color-accent-hover) font-extrabold text-xs tracking-wide px-3 py-1.5"
          >
            <CheckCircle2 className="w-3.5 h-3.5" /> VERIFIED — PASS
          </motion.span>
        </div>

        <p className="text-xs tracking-wide uppercase text-(--color-mist) mb-2.5">
          Settlement split
        </p>
        <div className="flex w-full h-10 rounded-lg overflow-hidden border border-(--color-hairline)">
          {settlementSplit.map((seg, i) => (
            <motion.div
              key={seg.label}
              initial={{ width: 0 }}
              animate={inView ? { width: `${seg.pct}%` } : {}}
              transition={{ duration: 0.9, delay: i * 0.12, ease: [0.16, 1, 0.3, 1] }}
              className={segColors[i]}
            />
          ))}
        </div>

        <div className="grid sm:grid-cols-3 gap-4 mt-4">
          {settlementSplit.map((seg, i) => (
            <div key={seg.label} className="flex items-baseline gap-2">
              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${dotColors[i]}`} />
              <p className="text-[14.5px] m-0">
                <strong>{seg.pct}%</strong> {seg.label}
              </p>
            </div>
          ))}
        </div>

        <p className="text-[15px] leading-relaxed text-(--color-ink)/80 mt-8 pt-6 border-t border-(--color-hairline)">
          Priced with live Pyth data, authorized by a signed AP2 mandate, settled through x402 —
          then independently re-derived from raw chain history by a verifier with no access to
          Ashlar's systems. Result: <strong>PASS</strong>. A second, structurally different
          workflow (<code className="text-xs">{workflows.recurringConditional.type}</code>) settled
          the same way, proving one engine, not one app.
        </p>

        <div className="flex flex-wrap gap-3 mt-6">
          <a
            href={x402Tx.explorer}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-(--color-accent) hover:text-(--color-accent-hover)"
          >
            Real x402 payment tx <ExternalLink className="w-3.5 h-3.5" />
          </a>
          <span className="text-(--color-hairline)">·</span>
          <a
            href={receiptCnft.explorer}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-(--color-accent) hover:text-(--color-accent-hover)"
          >
            Receipt cNFT <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        <p className="text-xs text-(--color-mist) mt-6">
          Devnet demo — the 85/10/5 split is a fixed constant, and the tax-reserve / yield-pool
          legs are placeholder devnet wallets, not live DeFi deposits.
        </p>
      </div>
    </section>
  );
}
