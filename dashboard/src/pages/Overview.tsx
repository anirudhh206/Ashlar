import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  Activity,
  CheckCircle2,
  FileBadge,
  GitBranch,
  Loader2,
  Radio,
  Receipt as ReceiptIcon,
  SearchCheck,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { StatCard } from '../components/StatCard.js';
import {
  explorerAddress,
  formatTime,
  RELAY_URL,
  short,
  workflowIdToDate,
  type AttestationEvent,
  type LedgerEntry,
  type Receipt,
  type SettlementEvidence,
  type WorkflowSummary,
} from '../types.js';

interface OverviewProps {
  onVerify: (pda: string) => void;
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export function Overview({ onVerify }: OverviewProps) {
  const [workflows, setWorkflows] = useState<{ total: number; items: WorkflowSummary[] } | null>(null);
  const [settlements, setSettlements] = useState<SettlementEvidence[] | null>(null);
  const [receipts, setReceipts] = useState<Receipt[] | null>(null);
  const [recentLedger, setRecentLedger] = useState<LedgerEntry[] | null>(null);
  const [liveEvents, setLiveEvents] = useState<AttestationEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const resumeInFlight = useRef<Set<string>>(new Set());
  const [, forceRender] = useState(0);

  useEffect(() => {
    Promise.all([
      fetch(`${RELAY_URL}/workflows?limit=300`).then((r) => r.json()) as Promise<{
        total: number;
        items: WorkflowSummary[];
      }>,
      fetch(`${RELAY_URL}/settlements`).then((r) => r.json()) as Promise<{ settlements: SettlementEvidence[] }>,
      fetch(`${RELAY_URL}/receipts`).then((r) => r.json()) as Promise<{ receipts: Receipt[] }>,
    ])
      .then(([wf, st, rc]) => {
        setWorkflows(wf);
        setSettlements(st.settlements);
        setReceipts(rc.receipts);
        setLoading(false);
        const mostRecent = wf.items[0];
        if (mostRecent) {
          fetch(`${RELAY_URL}/workflow/${mostRecent.pda}`)
            .then((r) => r.json())
            .then((snap) => setRecentLedger(snap.ledger.entries))
            .catch(() => {});
        }
      })
      .catch(() => setLoading(false));

    const source = new EventSource(`${RELAY_URL}/events`);
    source.onmessage = (msg) => {
      const event = JSON.parse(msg.data) as AttestationEvent;
      setLiveEvents((prev) => [event, ...prev].slice(0, 12));
    };
    return () => source.close();
  }, []);

  async function handleResume(w: WorkflowSummary, approved: boolean) {
    resumeInFlight.current.add(w.pda);
    forceRender((n) => n + 1);
    try {
      await fetch(`${RELAY_URL}/resume`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ workflowId: w.workflowId, approved }),
      });
      setWorkflows((prev) =>
        prev ? { ...prev, items: prev.items.map((x) => (x.pda === w.pda ? { ...x, status: 'resolving' } : x)) } : prev,
      );
    } finally {
      resumeInFlight.current.delete(w.pda);
      forceRender((n) => n + 1);
    }
  }

  if (loading || !workflows) {
    return (
      <p className="text-[13.5px] text-(--color-mist) flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading real system state…
      </p>
    );
  }

  const active = workflows.items.filter((w) => w.status === 'inProgress').length;
  const pending = workflows.items.filter((w) => w.status === 'pendingOverrideApproval');
  const settledRecent = (settlements ?? []).filter(
    (s) => Date.now() - Number(s.workflowId) < THIRTY_DAYS_MS,
  );
  const settledSum = settledRecent.reduce((sum, s) => sum + s.totalAmountUsd, 0);
  const recent = workflows.items.slice(0, 6);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Active workflows" value={String(active)} icon={GitBranch} />
        <StatCard label="Pending approvals" value={String(pending.length)} icon={ShieldCheck} accent={pending.length > 0} />
        <StatCard label="Settled, last 30 days" value={`$${settledSum.toFixed(2)}`} icon={ReceiptIcon} />
        <StatCard label="Receipts minted" value={String(receipts?.length ?? 0)} icon={FileBadge} />
      </div>

      <div className="grid lg:grid-cols-[1.5fr_1fr] gap-4 items-start">
        <div className="rounded-xl border border-(--color-hairline) bg-white overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3.5 border-b border-(--color-hairline)">
            <GitBranch className="w-4 h-4 text-(--color-accent-hover)" />
            <h2 className="font-semibold text-[14.5px] m-0">Recent workflows</h2>
          </div>
          <div className="flex flex-col">
            {recent.map((w) => (
              <div
                key={w.pda}
                className="flex items-center gap-3 px-5 py-3 border-b border-(--color-hairline) last:border-0 hover:bg-(--color-surface) transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <a
                    href={explorerAddress(w.pda)}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-[12.5px] hover:text-(--color-accent)"
                  >
                    {short(w.pda)}
                  </a>
                  <p className="text-[11px] text-(--color-mist) m-0">
                    {w.workflowType} · {workflowIdToDate(w.workflowId).toLocaleDateString()}
                  </p>
                </div>
                <span className="text-[10.5px] font-semibold rounded-full px-2 py-0.5 bg-(--color-surface) text-(--color-mist)">
                  {w.status}
                </span>
                <button
                  onClick={() => onVerify(w.pda)}
                  className="text-(--color-accent) hover:text-(--color-accent-hover) shrink-0"
                  title="Verify"
                >
                  <SearchCheck className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="rounded-xl border border-(--color-hairline) bg-white overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3.5 border-b border-(--color-hairline)">
              <ShieldCheck className="w-4 h-4 text-(--color-accent-hover)" />
              <h2 className="font-semibold text-[14.5px] m-0">Needs your approval</h2>
            </div>
            {pending.length === 0 ? (
              <p className="text-[13px] text-(--color-mist) px-5 py-4 m-0">Nothing paused right now.</p>
            ) : (
              <div className="flex flex-col">
                {pending.slice(0, 4).map((w) => (
                  <div key={w.pda} className="px-5 py-3.5 border-b border-(--color-hairline) last:border-0">
                    <p className="font-mono text-[12px] m-0 mb-1">{short(w.pda)}</p>
                    <p className="text-[11.5px] text-(--color-mist) m-0 mb-2.5">
                      requested {w.pendingAmount} · cap {w.spendCap}
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleResume(w, true)}
                        disabled={resumeInFlight.current.has(w.pda)}
                        className="text-[11.5px] font-semibold rounded-md bg-(--color-accent) text-white px-3 py-1 disabled:opacity-50"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => handleResume(w, false)}
                        disabled={resumeInFlight.current.has(w.pda)}
                        className="text-[11.5px] font-semibold rounded-md border border-(--color-hairline) px-3 py-1 disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-(--color-hairline) bg-white overflow-hidden">
            <div className="flex items-center justify-between gap-2 px-5 py-3.5 border-b border-(--color-hairline)">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-(--color-accent-hover)" />
                <h2 className="font-semibold text-[14.5px] m-0">Guardrail activity</h2>
              </div>
              <Radio className="w-3.5 h-3.5 text-(--color-accent) animate-pulse" />
            </div>
            {liveEvents.length === 0 ? (
              <p className="text-[12.5px] text-(--color-mist) px-5 py-4 m-0">
                Watching for real attestations program-wide — nothing has landed since this page
                opened yet.
              </p>
            ) : (
              <div className="flex flex-col max-h-[280px] overflow-y-auto">
                {liveEvents.map((e, i) => (
                  <motion.div
                    key={`${e.workflow}-${e.stepIndex}-${i}`}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex items-start gap-2.5 px-5 py-2.5 border-b border-(--color-hairline) last:border-0"
                  >
                    {e.outcome === 'passed' || e.outcome === 'executed' ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-(--color-accent) shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                    )}
                    <p className="text-[12px] m-0 leading-snug">
                      {e.stepKind} {e.outcome} — {short(e.workflow)}
                      <br />
                      <span className="text-(--color-mist)">{formatTime(e.timestamp)}</span>
                    </p>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1.5fr_1fr] gap-4 items-start">
        <div className="rounded-xl border border-(--color-hairline) bg-white overflow-hidden">
          <div className="px-5 py-3.5 border-b border-(--color-hairline)">
            <h2 className="font-semibold text-[14.5px] m-0">Proof trail — most recent workflow</h2>
          </div>
          {!recentLedger ? (
            <p className="text-[13px] text-(--color-mist) px-5 py-4 m-0">No workflows yet.</p>
          ) : (
            <div className="flex flex-col px-5 py-4">
              {recentLedger.map((entry, i) => (
                <div key={i} className="flex items-center gap-3 py-2">
                  <span className="w-2 h-2 rounded-full bg-(--color-accent) shrink-0" />
                  <p className="text-[12.5px] font-medium m-0 flex-1">
                    {entry.stepKind} — {entry.outcome}
                  </p>
                  <p className="text-[11px] text-(--color-mist) m-0 tabular-nums">
                    {formatTime(entry.timestamp)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl bg-(--color-ink) text-white p-5">
          <div className="flex items-center gap-2.5 mb-3">
            <SearchCheck className="w-5 h-5 text-(--color-accent-glow)" />
            <h2 className="font-semibold text-[14.5px] m-0">Independent verifier</h2>
          </div>
          <p className="text-[12.5px] text-white/70 leading-relaxed mb-4">
            No login, no access to Ashlar's systems. Pick any workflow above and re-derive its
            entire proof chain from raw chain history, on demand.
          </p>
          <button
            onClick={() => recent[0] && onVerify(recent[0].pda)}
            className="w-full rounded-lg bg-(--color-accent) text-white font-medium text-[13px] py-2.5 hover:bg-(--color-accent-hover) transition-colors"
          >
            Run verifier
          </button>
        </div>
      </div>
    </div>
  );
}
