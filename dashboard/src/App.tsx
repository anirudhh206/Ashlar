import { useEffect, useRef, useState, type FormEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowUpRight,
  CheckCircle2,
  CircleAlert,
  ExternalLink,
  Loader2,
  Radio,
} from 'lucide-react';

// Only ever talks to the relay's own endpoints — never Helius, never holds an API key. See
// dashboard/server/relay.ts.
const RELAY_URL = import.meta.env.VITE_RELAY_URL ?? 'http://localhost:8789';
const LANDING_URL = import.meta.env.VITE_LANDING_URL ?? 'http://localhost:5174';

interface LedgerEntry {
  stepIndex: number;
  stepKind: string;
  outcome: string;
  timestamp: number;
}

interface WorkflowSnapshot {
  workflow: {
    owner: string;
    workflowType: string;
    status: string;
    currentStep: number;
    spendCap: string;
  };
  ledger: { entries: LedgerEntry[] };
}

interface AttestationEvent {
  type: 'attestation';
  workflow: string;
  stepIndex: number;
  stepKind: string;
  outcome: string;
  executedBy: string;
  timestamp: number;
}

function formatTime(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleTimeString();
}

function explorerLink(address: string): string {
  return `https://explorer.solana.com/address/${address}?cluster=devnet`;
}

const outcomeStyle: Record<string, string> = {
  passed: 'text-(--color-accent-hover) bg-(--color-accent-soft)',
  executed: 'text-(--color-accent-hover) bg-(--color-accent-soft)',
  failed: 'text-red-700 bg-red-50',
  rejected: 'text-red-700 bg-red-50',
};

export function App() {
  const [workflowInput, setWorkflowInput] = useState('');
  const [watchedWorkflow, setWatchedWorkflow] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<WorkflowSnapshot | null>(null);
  const [liveEvents, setLiveEvents] = useState<AttestationEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const [instruction, setInstruction] = useState('');
  // Deliberately sessionStorage, not localStorage: this token authorizes real devnet spend, so it
  // should never survive past the browser tab closing, let alone persist to disk indefinitely.
  // It's still a real credential typed into a browser field — see the caveat in the form below.
  const [deploySecret, setDeploySecret] = useState(
    () => sessionStorage.getItem('ashlar-deploy-secret') ?? '',
  );
  const [deployStatus, setDeployStatus] = useState<'idle' | 'deploying' | 'error'>('idle');
  const [deployError, setDeployError] = useState<string | null>(null);

  useEffect(() => {
    if (!watchedWorkflow) return;

    setSnapshot(null);
    setLiveEvents([]);
    setError(null);

    fetch(`${RELAY_URL}/workflow/${watchedWorkflow}`)
      .then((res) => (res.ok ? (res.json() as Promise<WorkflowSnapshot>) : Promise.reject(new Error(`relay returned ${res.status}`))))
      .then((data) => setSnapshot(data))
      .catch((err: Error) => setError(err.message));

    const source = new EventSource(`${RELAY_URL}/events?workflow=${watchedWorkflow}`);
    eventSourceRef.current = source;
    source.onmessage = (msg) => {
      const event = JSON.parse(msg.data) as AttestationEvent;
      setLiveEvents((prev) => [...prev, event]);
    };
    source.onerror = () => setError('live event stream disconnected');

    return () => source.close();
  }, [watchedWorkflow]);

  const displayedSteps = liveEvents.length > 0 ? liveEvents : (snapshot?.ledger.entries ?? []);

  async function handleDeploySubmit(e: FormEvent) {
    e.preventDefault();
    if (!instruction.trim() || !deploySecret.trim()) return;

    sessionStorage.setItem('ashlar-deploy-secret', deploySecret.trim());
    setDeployStatus('deploying');
    setDeployError(null);

    try {
      const res = await fetch(`${RELAY_URL}/deploy`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${deploySecret.trim()}`,
        },
        body: JSON.stringify({ instruction: instruction.trim() }),
      });
      if (!res.ok) {
        throw new Error(`relay returned ${res.status}: ${await res.text()}`);
      }
      const { workflowPda } = (await res.json()) as { workflowPda: string };
      setDeployStatus('idle');
      // Reuse the exact same watch mechanism used for any other workflow PDA — the newly
      // created workflow's remaining real steps stream in live via /events, no new UI needed.
      setWorkflowInput(workflowPda);
      setWatchedWorkflow(workflowPda);
    } catch (err) {
      setDeployStatus('error');
      setDeployError((err as Error).message);
    }
  }

  return (
    <div className="min-h-screen">
      <nav className="sticky top-0 z-10 flex items-center gap-4 px-6 sm:px-10 py-4 bg-white/75 backdrop-blur-xl border-b border-(--color-hairline)">
        <a href={LANDING_URL} className="font-extrabold tracking-tight text-lg">
          ASHLAR
        </a>
        <span className="text-sm text-(--color-mist)">Live Workflow Verification</span>
        <a
          href={LANDING_URL}
          className="ml-auto inline-flex items-center gap-1 text-sm font-medium text-(--color-mist) hover:text-(--color-accent) transition-colors"
        >
          About Ashlar <ArrowUpRight className="w-3.5 h-3.5" />
        </a>
      </nav>

      <main className="max-w-[720px] mx-auto px-6 sm:px-10 py-14">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <h1 className="font-extrabold text-[clamp(28px,3.4vw,40px)] tracking-tight mb-3">
            Live Workflow Verification
          </h1>
          <p className="text-[15px] leading-relaxed text-(--color-mist) mb-10 max-w-[62ch]">
            Watch a workflow's attestations land on-chain in real time, or deploy a new one for
            real. Independently verify any workflow yourself with{' '}
            <code className="font-mono text-[13px] bg-(--color-surface) rounded px-1.5 py-0.5">
              pnpm verify &lt;address&gt;
            </code>
            .
          </p>
        </motion.div>

        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.05 }}
          className="rounded-2xl border border-(--color-hairline) bg-white p-6 mb-6"
        >
          <h2 className="font-extrabold text-lg mb-1.5">Deploy a workflow</h2>
          <p className="text-[13.5px] text-(--color-mist) mb-2">
            Compiles a real instruction and runs it through all 5 gates on Solana devnet — a real
            transaction, not a mockup.
          </p>
          <p className="text-[12.5px] text-(--color-mist) mb-5 flex items-start gap-1.5">
            <CircleAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            This token matches <code className="font-mono">DASHBOARD_DEPLOY_SECRET</code> on your
            own relay — it's real spending authority, not a login. Only ever enter it here if
            you're running this dashboard yourself, pointed at your own relay. It's kept in this
            tab's session only, never persisted to disk.
          </p>
          <form onSubmit={handleDeploySubmit} className="flex flex-col gap-3">
            <input
              type="text"
              placeholder='e.g. "Pay up to $50 every Friday to allowlisted vendors."'
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              className="w-full rounded-xl border border-(--color-hairline) bg-(--color-surface) px-4 py-2.5 text-[14px] outline-none focus:border-(--color-accent) transition-colors"
            />
            <div className="flex gap-3 flex-wrap">
              <input
                type="password"
                placeholder="Operator token"
                value={deploySecret}
                onChange={(e) => setDeploySecret(e.target.value)}
                className="flex-1 min-w-[180px] rounded-xl border border-(--color-hairline) bg-(--color-surface) px-4 py-2.5 text-[14px] outline-none focus:border-(--color-accent) transition-colors"
              />
              <button
                type="submit"
                disabled={deployStatus === 'deploying'}
                className="inline-flex items-center gap-2 rounded-full bg-(--color-accent) text-white font-semibold text-[14px] px-6 py-2.5 transition-transform hover:-translate-y-0.5 hover:bg-(--color-accent-hover) disabled:opacity-50 disabled:hover:translate-y-0"
              >
                {deployStatus === 'deploying' && <Loader2 className="w-4 h-4 animate-spin" />}
                {deployStatus === 'deploying' ? 'Deploying…' : 'Deploy'}
              </button>
            </div>
          </form>
          {deployError && (
            <p className="mt-3 text-[13.5px] text-red-700 flex items-center gap-1.5">
              <CircleAlert className="w-4 h-4 shrink-0" /> {deployError}
            </p>
          )}
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="rounded-2xl border border-(--color-hairline) bg-white p-6 mb-6"
        >
          <h2 className="font-extrabold text-lg mb-4">Watch a workflow</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (workflowInput.trim()) setWatchedWorkflow(workflowInput.trim());
            }}
            className="flex gap-3 flex-wrap"
          >
            <input
              type="text"
              placeholder="Workflow PDA address"
              value={workflowInput}
              onChange={(e) => setWorkflowInput(e.target.value)}
              className="flex-1 min-w-[240px] rounded-xl border border-(--color-hairline) bg-(--color-surface) px-4 py-2.5 text-[14px] font-mono outline-none focus:border-(--color-accent) transition-colors"
            />
            <button
              type="submit"
              className="inline-flex items-center rounded-full border border-(--color-hairline) font-semibold text-[14px] px-6 py-2.5 transition-transform hover:-translate-y-0.5 hover:border-(--color-ink)"
            >
              Watch
            </button>
          </form>
        </motion.section>

        {error && (
          <p className="text-[13.5px] text-red-700 flex items-center gap-1.5 mb-6">
            <CircleAlert className="w-4 h-4 shrink-0" /> {error}
          </p>
        )}

        {snapshot && (
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-(--color-hairline) bg-(--color-surface) p-6 mb-6"
          >
            <div className="grid sm:grid-cols-2 gap-4 text-[14px]">
              <div>
                <p className="text-[11px] tracking-wide uppercase text-(--color-mist) mb-1">
                  Owner
                </p>
                <a
                  href={explorerLink(snapshot.workflow.owner)}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-[12.5px] break-all inline-flex items-center gap-1 hover:text-(--color-accent)"
                >
                  {snapshot.workflow.owner} <ExternalLink className="w-3 h-3 shrink-0" />
                </a>
              </div>
              <div>
                <p className="text-[11px] tracking-wide uppercase text-(--color-mist) mb-1">
                  Type
                </p>
                <p className="m-0">{snapshot.workflow.workflowType}</p>
              </div>
              <div>
                <p className="text-[11px] tracking-wide uppercase text-(--color-mist) mb-1">
                  Status
                </p>
                <p className="m-0 font-semibold">{snapshot.workflow.status}</p>
              </div>
              <div>
                <p className="text-[11px] tracking-wide uppercase text-(--color-mist) mb-1">
                  Step
                </p>
                <p className="m-0">{snapshot.workflow.currentStep}</p>
              </div>
            </div>
          </motion.section>
        )}

        {watchedWorkflow && (
          <section className="rounded-2xl border border-(--color-hairline) bg-white p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-extrabold text-lg m-0">Attestations</h2>
              {liveEvents.length > 0 && (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-(--color-accent-hover) bg-(--color-accent-soft) rounded-full px-2.5 py-1">
                  <Radio className="w-3 h-3 animate-pulse" /> live
                </span>
              )}
            </div>
            {displayedSteps.length === 0 && (
              <p className="text-[14px] text-(--color-mist)">No steps attested yet.</p>
            )}
            <ul className="flex flex-col gap-1 list-none p-0 m-0">
              <AnimatePresence initial={false}>
                {displayedSteps.map((step, i) => (
                  <motion.li
                    key={`${step.stepIndex}-${i}`}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-(--color-surface) transition-colors"
                  >
                    <CheckCircle2 className="w-[18px] h-[18px] text-(--color-accent) shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-[13px] font-medium m-0">
                        step {step.stepIndex}: {step.stepKind}
                      </p>
                      <p className="text-[12px] text-(--color-mist) m-0">
                        {formatTime(step.timestamp)}
                      </p>
                    </div>
                    <span
                      className={`text-[11px] font-semibold rounded-full px-2.5 py-1 shrink-0 ${
                        outcomeStyle[step.outcome.toLowerCase()] ?? 'bg-(--color-surface) text-(--color-mist)'
                      }`}
                    >
                      {step.outcome}
                    </span>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
