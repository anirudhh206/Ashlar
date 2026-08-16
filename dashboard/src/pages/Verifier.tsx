import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, CircleAlert, ExternalLink, Loader2, SearchCheck, XCircle } from 'lucide-react';
import { RELAY_URL, type VerificationReport } from '../types.js';
import { useToast } from '../components/Toast.js';
import { SkeletonRows } from '../components/Skeleton.js';

interface VerifierProps {
  prefill: string | null;
}

export function Verifier({ prefill }: VerifierProps) {
  const [address, setAddress] = useState(prefill ?? '');
  const [report, setReport] = useState<VerificationReport | null>(null);
  const [status, setStatus] = useState<'idle' | 'running' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  useEffect(() => {
    if (prefill) {
      setAddress(prefill);
      void runVerify(prefill);
    }
    // Deliberately only re-runs when `prefill` itself changes, not on every render.
  }, [prefill]);

  async function runVerify(pda: string) {
    if (!pda.trim()) return;
    setStatus('running');
    setError(null);
    setReport(null);
    try {
      const res = await fetch(`${RELAY_URL}/verify`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ workflowPda: pda.trim() }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? `relay returned ${res.status}`);
      const result = (await res.json()) as VerificationReport;
      setReport(result);
      setStatus('idle');
      toast.push(
        result.overallPass ? 'success' : 'error',
        result.overallPass ? 'Independently verified — PASS.' : 'Verification found a mismatch — FAIL.',
      );
    } catch (err) {
      setStatus('error');
      setError((err as Error).message);
    }
  }

  return (
    <div>
      <section className="rounded-xl border border-(--color-hairline) bg-white p-5 mb-4">
        <p className="text-[13px] text-(--color-mist) mb-4">
          No login, no access to Ashlar's systems. This re-fetches the real transaction history
          from Solana and re-derives every proof itself — the exact same logic as{' '}
          <code className="font-mono text-[12px]">pnpm verify</code>, running here so you can
          click it instead of opening a terminal.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void runVerify(address);
          }}
          className="flex gap-2.5 flex-wrap"
        >
          <input
            type="text"
            placeholder="Workflow PDA address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="flex-1 min-w-[240px] rounded-lg border border-(--color-hairline) bg-(--color-surface) px-3.5 py-2 text-[13.5px] font-mono outline-none focus:border-(--color-accent) transition-colors"
          />
          <button
            type="submit"
            disabled={status === 'running'}
            className="inline-flex items-center gap-2 rounded-lg bg-(--color-accent) text-white font-medium text-[13.5px] px-5 py-2 transition-transform hover:-translate-y-0.5 hover:bg-(--color-accent-hover) disabled:opacity-50 disabled:hover:translate-y-0"
          >
            {status === 'running' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <SearchCheck className="w-3.5 h-3.5" />}
            {status === 'running' ? 'Verifying…' : 'Run verifier'}
          </button>
        </form>
        {error && (
          <p className="mt-3 text-[13px] text-red-700 flex items-center gap-1.5">
            <CircleAlert className="w-3.5 h-3.5 shrink-0" /> {error}
          </p>
        )}
      </section>

      {status === 'running' && !report && <SkeletonRows count={4} />}

      <AnimatePresence>
        {report && (
          <motion.section
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="rounded-xl border border-(--color-hairline) bg-white p-5"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.4, ease: 'backOut' }}
              className="flex items-center gap-2.5 mb-4"
            >
              {report.overallPass ? (
                <CheckCircle2 className="w-5 h-5 text-(--color-accent)" />
              ) : (
                <XCircle className="w-5 h-5 text-red-600" />
              )}
              <h2 className="font-semibold text-[16px] m-0">
                {report.overallPass ? 'PASS' : 'FAIL'} — {report.workflowType}, {report.status}
              </h2>
            </motion.div>

            {report.structuralIssues.length > 0 && (
              <ul className="mb-4 text-[12.5px] text-red-700 list-disc pl-5">
                {report.structuralIssues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            )}

            <div className="flex flex-col gap-1.5">
              {report.steps.map((s, i) => {
                const pass = s.signerVerified && s.hashVerified;
                return (
                  <motion.div
                    key={s.stepIndex}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.25, delay: i * 0.06 }}
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 border border-(--color-hairline)"
                  >
                    {pass ? (
                      <CheckCircle2 className="w-4 h-4 text-(--color-accent) shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-600 shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-[12.5px] font-medium m-0">
                        step {s.stepIndex}: {s.attestedStepKind} — {s.outcome}
                      </p>
                      <p className="text-[11px] text-(--color-mist) m-0">
                        signer {s.signerVerified ? 'verified' : 'FAILED'} · hash{' '}
                        {s.hashVerified ? 'verified' : 'FAILED'}
                        {s.detail ? ` · ${s.detail}` : ''}
                      </p>
                    </div>
                    {s.explorerLink && (
                      <a
                        href={s.explorerLink}
                        target="_blank"
                        rel="noreferrer"
                        className="text-(--color-accent) hover:text-(--color-accent-hover) shrink-0"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}
