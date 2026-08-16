import { useEffect, useRef, useState, type FormEvent } from 'react';

// Only ever talks to the relay's own endpoints — never Helius, never holds an API key. See
// dashboard/server/relay.ts.
const RELAY_URL = import.meta.env.VITE_RELAY_URL ?? 'http://localhost:8789';

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

export function App() {
  const [workflowInput, setWorkflowInput] = useState('');
  const [watchedWorkflow, setWatchedWorkflow] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<WorkflowSnapshot | null>(null);
  const [liveEvents, setLiveEvents] = useState<AttestationEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const [instruction, setInstruction] = useState('');
  const [deploySecret, setDeploySecret] = useState(
    () => localStorage.getItem('ashlar-deploy-secret') ?? '',
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

    localStorage.setItem('ashlar-deploy-secret', deploySecret.trim());
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
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 720, margin: '0 auto', padding: '2rem' }}>
      <h1>Ashlar — Live Workflow Verification</h1>
      <p>
        Watch a workflow's attestations land on-chain in real time. Independently verify any
        workflow yourself with <code>pnpm verify &lt;address&gt;</code>.
      </p>

      <section
        style={{
          marginBottom: '2rem',
          padding: '1.25rem',
          border: '1px solid #ddd',
          borderRadius: 8,
        }}
      >
        <h2 style={{ marginTop: 0 }}>Deploy a workflow</h2>
        <p style={{ marginTop: 0, color: '#555' }}>
          Compiles a real instruction and runs it through all 5 gates on Solana devnet — a real
          transaction, not a mockup. Requires the operator token configured server-side as{' '}
          <code>DASHBOARD_DEPLOY_SECRET</code>.
        </p>
        <form onSubmit={handleDeploySubmit}>
          <input
            type="text"
            placeholder='e.g. "Pay up to $50 every Friday to allowlisted vendors."'
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            style={{ width: '100%', padding: '0.5rem', boxSizing: 'border-box', marginBottom: '0.5rem' }}
          />
          <input
            type="password"
            placeholder="Operator token"
            value={deploySecret}
            onChange={(e) => setDeploySecret(e.target.value)}
            style={{ width: '60%', padding: '0.5rem' }}
          />
          <button
            type="submit"
            disabled={deployStatus === 'deploying'}
            style={{ padding: '0.5rem 1rem', marginLeft: '0.5rem' }}
          >
            {deployStatus === 'deploying' ? 'Deploying…' : 'Deploy'}
          </button>
        </form>
        {deployError && <p style={{ color: 'crimson' }}>{deployError}</p>}
      </section>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (workflowInput.trim()) setWatchedWorkflow(workflowInput.trim());
        }}
      >
        <input
          type="text"
          placeholder="Workflow PDA address"
          value={workflowInput}
          onChange={(e) => setWorkflowInput(e.target.value)}
          style={{ width: '70%', padding: '0.5rem' }}
        />
        <button type="submit" style={{ padding: '0.5rem 1rem', marginLeft: '0.5rem' }}>
          Watch
        </button>
      </form>

      {error && <p style={{ color: 'crimson' }}>{error}</p>}

      {snapshot && (
        <section style={{ marginTop: '1.5rem' }}>
          <p>
            <strong>Owner:</strong> {snapshot.workflow.owner}
            <br />
            <strong>Type:</strong> {snapshot.workflow.workflowType}
            <br />
            <strong>Status:</strong> {snapshot.workflow.status}
            <br />
            <strong>Step:</strong> {snapshot.workflow.currentStep}
          </p>
        </section>
      )}

      {watchedWorkflow && (
        <section style={{ marginTop: '1.5rem' }}>
          <h2>Attestations</h2>
          {displayedSteps.length === 0 && <p>No steps attested yet.</p>}
          <ul>
            {displayedSteps.map((step, i) => (
              <li key={`${step.stepIndex}-${i}`}>
                step {step.stepIndex}: <strong>{step.stepKind}</strong> — {step.outcome} at{' '}
                {formatTime(step.timestamp)}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
