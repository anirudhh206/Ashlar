import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, CircleAlert, Loader2, ShieldAlert, ShieldCheck } from 'lucide-react';
import { explorerAddress, explorerTx, RELAY_URL, short, type WorkflowSummary } from '../types.js';
import { EmptyState } from '../components/EmptyState.js';
import { SkeletonRows } from '../components/Skeleton.js';
import { CopyButton } from '../components/CopyButton.js';
import { useToast } from '../components/Toast.js';
import { useLiveEvents } from '../hooks/useLiveEvents.js';

interface RowState {
  status: 'idle' | 'submitting' | 'error';
  error: string | null;
  signature: string | null;
}

export function Approvals() {
  const [items, setItems] = useState<WorkflowSummary[] | null>(null);
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [rowState, setRowState] = useState<Record<string, RowState>>({});
  const toast = useToast();

  function load(silent = false) {
    if (!silent) setStatus('loading');
    fetch(`${RELAY_URL}/workflows?limit=300`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`relay returned ${res.status}`);
        return res.json() as Promise<{ items: WorkflowSummary[] }>;
      })
      .then((d) => {
        setItems(d.items.filter((w) => w.status === 'pendingOverrideApproval'));
        setStatus('loaded');
      })
      .catch((err: Error) => {
        setError(err.message);
        setStatus('error');
      });
  }

  useEffect(load, []);
  // Real-time: a new guardrail breach anywhere shows up here live, and a resolution made from
  // another tab (or the Overview page) removes it here too, without a manual reload.
  useLiveEvents(() => load(true));

  async function handleResume(w: WorkflowSummary, approved: boolean) {
    setRowState((prev) => ({ ...prev, [w.pda]: { status: 'submitting', error: null, signature: null } }));
    try {
      const res = await fetch(`${RELAY_URL}/resume`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ workflowId: w.workflowId, approved }),
      });
      if (!res.ok) throw new Error(`relay returned ${res.status}: ${await res.text()}`);
      const { signature } = (await res.json()) as { signature: string };
      setRowState((prev) => ({ ...prev, [w.pda]: { status: 'idle', error: null, signature } }));
      setItems((prev) => (prev ? prev.filter((x) => x.pda !== w.pda) : prev));
      toast.push('success', `${approved ? 'Approved' : 'Rejected'} — real transaction confirmed.`);
    } catch (err) {
      setRowState((prev) => ({
        ...prev,
        [w.pda]: { status: 'error', error: (err as Error).message, signature: null },
      }));
      toast.push('error', 'Resolution failed — see the error below.');
    }
  }

  if (status === 'loading') return <SkeletonRows count={3} />;
  if (status === 'error') {
    return (
      <p className="text-[13.5px] text-red-700 flex items-center gap-1.5">
        <CircleAlert className="w-4 h-4 shrink-0" /> {error}
      </p>
    );
  }
  if (!items || items.length === 0) {
    return (
      <EmptyState
        icon={ShieldCheck}
        title="Nothing needs your approval"
        body="No workflow is currently paused in PendingOverrideApproval. A real spend-cap breach shows up here the moment it happens."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <AnimatePresence>
      {items.map((w) => {
        const rs = rowState[w.pda];
        return (
          <motion.section
            key={w.pda}
            layout
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.3 }}
            className="rounded-xl border border-(--color-hairline) bg-white p-5"
          >
            <div className="flex items-center gap-2.5 mb-3">
              <ShieldAlert className="w-5 h-5 text-(--color-accent-hover)" />
              <a
                href={explorerAddress(w.pda)}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-[13px] hover:text-(--color-accent)"
              >
                {short(w.pda)}
              </a>
              <CopyButton value={w.pda} />
            </div>
            <div className="grid sm:grid-cols-3 gap-3.5 text-[13.5px] mb-5">
              <div>
                <p className="text-[10.5px] tracking-wide uppercase text-(--color-mist) mb-1">Spend cap</p>
                <p className="m-0 font-mono">{w.spendCap}</p>
              </div>
              <div>
                <p className="text-[10.5px] tracking-wide uppercase text-(--color-mist) mb-1">Requested amount</p>
                <p className="m-0 font-mono text-(--color-accent-hover) font-semibold">{w.pendingAmount}</p>
              </div>
              <div>
                <p className="text-[10.5px] tracking-wide uppercase text-(--color-mist) mb-1">Recipient</p>
                <a
                  href={explorerAddress(w.pendingRecipient)}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-[12px] break-all hover:text-(--color-accent)"
                >
                  {w.pendingRecipient}
                </a>
              </div>
            </div>
            <div className="flex gap-2.5">
              <button
                onClick={() => handleResume(w, true)}
                disabled={rs?.status === 'submitting'}
                className="inline-flex items-center gap-2 rounded-lg bg-(--color-accent) text-white font-medium text-[13.5px] px-5 py-2 transition-colors hover:bg-(--color-accent-hover) disabled:opacity-50"
              >
                {rs?.status === 'submitting' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Approve
              </button>
              <button
                onClick={() => handleResume(w, false)}
                disabled={rs?.status === 'submitting'}
                className="inline-flex items-center gap-2 rounded-lg border border-(--color-hairline) font-medium text-[13.5px] px-5 py-2 transition-colors hover:border-red-400 hover:text-red-700 disabled:opacity-50"
              >
                Reject
              </button>
            </div>
            {rs?.error && (
              <p className="mt-3 text-[13px] text-red-700 flex items-center gap-1.5">
                <CircleAlert className="w-3.5 h-3.5 shrink-0" /> {rs.error}
              </p>
            )}
            {rs?.signature && (
              <p className="mt-3 text-[13px] text-(--color-accent-hover) flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> Resolved —{' '}
                <a href={explorerTx(rs.signature)} target="_blank" rel="noreferrer" className="font-mono underline">
                  view transaction
                </a>
              </p>
            )}
          </motion.section>
        );
      })}
      </AnimatePresence>
    </div>
  );
}
