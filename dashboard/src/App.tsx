import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Workflows } from './sections/Workflows.js';
import { Guardrails } from './sections/Guardrails.js';
import { Settlement } from './sections/Settlement.js';
import {
  LANDING_URL,
  RELAY_URL,
  type AttestationEvent,
  type WorkflowSnapshot,
} from './types.js';
import { ArrowUpRight } from 'lucide-react';

type Tab = 'workflows' | 'guardrails' | 'settlement';
const TABS: { id: Tab; label: string }[] = [
  { id: 'workflows', label: 'Workflows' },
  { id: 'guardrails', label: 'Guardrails & Overrides' },
  { id: 'settlement', label: 'Settlement' },
];

export function App() {
  const [tab, setTab] = useState<Tab>('workflows');

  // Shared across all three tabs: watch one workflow, flip between tabs without re-entering it.
  const [workflowInput, setWorkflowInput] = useState('');
  const [watchedWorkflow, setWatchedWorkflow] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<WorkflowSnapshot | null>(null);
  const [liveEvents, setLiveEvents] = useState<AttestationEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const [instruction, setInstruction] = useState('');
  // Deliberately sessionStorage, not localStorage: this token authorizes real devnet spend, so it
  // should never survive past the browser tab closing, let alone persist to disk indefinitely.
  // Shared by both Deploy (Workflows tab) and Approve/Reject (Guardrails tab) — one token, one
  // trust boundary, not two separate prompts for what is really the same authorization.
  const [deploySecret, setDeploySecret] = useState(
    () => sessionStorage.getItem('ashlar-deploy-secret') ?? '',
  );
  const [deployStatus, setDeployStatus] = useState<'idle' | 'deploying' | 'error'>('idle');
  const [deployError, setDeployError] = useState<string | null>(null);

  const [resumeStatus, setResumeStatus] = useState<'idle' | 'submitting' | 'error'>('idle');
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [resumeSignature, setResumeSignature] = useState<string | null>(null);

  useEffect(() => {
    if (!watchedWorkflow) return;

    setSnapshot(null);
    setLiveEvents([]);
    setError(null);
    setResumeStatus('idle');
    setResumeError(null);
    setResumeSignature(null);

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

  function persistSecret(value: string) {
    setDeploySecret(value);
    sessionStorage.setItem('ashlar-deploy-secret', value);
  }

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

  async function handleResume(approved: boolean) {
    if (!snapshot || !deploySecret.trim()) return;
    setResumeStatus('submitting');
    setResumeError(null);
    setResumeSignature(null);

    try {
      const res = await fetch(`${RELAY_URL}/resume`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${deploySecret.trim()}`,
        },
        body: JSON.stringify({ workflowId: snapshot.workflow.workflowId, approved }),
      });
      if (!res.ok) {
        throw new Error(`relay returned ${res.status}: ${await res.text()}`);
      }
      const { signature } = (await res.json()) as { signature: string };
      setResumeStatus('idle');
      setResumeSignature(signature);
      // Re-fetch the snapshot so the Guardrails tab reflects the real new on-chain status.
      const fresh = await fetch(`${RELAY_URL}/workflow/${watchedWorkflow}`);
      if (fresh.ok) setSnapshot((await fresh.json()) as WorkflowSnapshot);
    } catch (err) {
      setResumeStatus('error');
      setResumeError((err as Error).message);
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

      <main className="max-w-[720px] mx-auto px-6 sm:px-10 py-10">
        <h1 className="font-extrabold text-[clamp(24px,3vw,32px)] tracking-tight mb-1.5">
          Live Workflow Verification
        </h1>
        <p className="text-[14px] leading-relaxed text-(--color-mist) mb-6 max-w-[62ch]">
          Deploy a workflow for real, watch its attestations land on-chain, resolve a paused
          override, or inspect its real settlement — all backed by real devnet transactions.
        </p>

        <div className="flex gap-1 border-b border-(--color-hairline) mb-6">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3.5 py-2.5 text-[13.5px] font-medium border-b-2 -mb-px transition-colors ${
                tab === t.id
                  ? 'border-(--color-accent) text-(--color-ink)'
                  : 'border-transparent text-(--color-mist) hover:text-(--color-ink)'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'workflows' && (
          <Workflows
            instruction={instruction}
            onInstructionChange={setInstruction}
            deploySecret={deploySecret}
            onDeploySecretChange={persistSecret}
            deployStatus={deployStatus}
            deployError={deployError}
            onDeploySubmit={handleDeploySubmit}
            workflowInput={workflowInput}
            onWorkflowInputChange={setWorkflowInput}
            onWatchSubmit={(e: FormEvent) => {
              e.preventDefault();
              if (workflowInput.trim()) setWatchedWorkflow(workflowInput.trim());
            }}
            watchedWorkflow={watchedWorkflow}
            snapshot={snapshot}
            liveEvents={liveEvents}
            error={error}
            displayedSteps={displayedSteps}
          />
        )}

        {tab === 'guardrails' && (
          <Guardrails
            watchedWorkflow={watchedWorkflow}
            snapshot={snapshot}
            resumeStatus={resumeStatus}
            resumeError={resumeError}
            resumeSignature={resumeSignature}
            onResume={handleResume}
          />
        )}

        {tab === 'settlement' && (
          <Settlement
            watchedWorkflow={watchedWorkflow}
            workflowId={snapshot?.workflow.workflowId ?? null}
          />
        )}
      </main>
    </div>
  );
}
