import { CheckCircle2, CircleAlert, Loader2, ShieldAlert, ShieldCheck } from 'lucide-react';
import { explorerAddress, explorerTx, type WorkflowSnapshot } from '../types.js';

interface GuardrailsProps {
  watchedWorkflow: string | null;
  snapshot: WorkflowSnapshot | null;
  resumeStatus: 'idle' | 'submitting' | 'error';
  resumeError: string | null;
  resumeSignature: string | null;
  onResume: (approved: boolean) => void;
}

export function Guardrails({
  watchedWorkflow,
  snapshot,
  resumeStatus,
  resumeError,
  resumeSignature,
  onResume,
}: GuardrailsProps) {
  if (!watchedWorkflow) {
    return (
      <section className="rounded-xl border border-(--color-hairline) bg-white p-5">
        <p className="text-[13.5px] text-(--color-mist) m-0">
          Watch a workflow on the Workflows tab first — its guardrail status shows up here.
        </p>
      </section>
    );
  }

  if (!snapshot) {
    return (
      <section className="rounded-xl border border-(--color-hairline) bg-white p-5">
        <p className="text-[13.5px] text-(--color-mist) m-0 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading workflow…
        </p>
      </section>
    );
  }

  const isPaused = snapshot.workflow.status === 'pendingOverrideApproval';

  return (
    <div>
      <section className="rounded-xl border border-(--color-hairline) bg-white p-5 mb-4">
        <div className="flex items-center gap-2.5 mb-4">
          {isPaused ? (
            <ShieldAlert className="w-5 h-5 text-(--color-accent-hover)" />
          ) : (
            <ShieldCheck className="w-5 h-5 text-(--color-mist)" />
          )}
          <h2 className="font-semibold text-[15px] m-0">
            {isPaused ? 'Paused — awaiting owner override' : 'No override pending'}
          </h2>
        </div>

        {isPaused ? (
          <>
            <p className="text-[13.5px] text-(--color-mist) mb-4">
              This workflow requested a spend over its cap. The on-chain guardrail refused to
              settle automatically — it needs a real, owner-signed decision below, exactly like{' '}
              <code className="font-mono text-[12px]">pnpm resume-workflow</code>.
            </p>
            <div className="grid sm:grid-cols-3 gap-3.5 text-[13.5px] mb-5">
              <div>
                <p className="text-[10.5px] tracking-wide uppercase text-(--color-mist) mb-1">
                  Spend cap
                </p>
                <p className="m-0 font-mono">{snapshot.workflow.spendCap}</p>
              </div>
              <div>
                <p className="text-[10.5px] tracking-wide uppercase text-(--color-mist) mb-1">
                  Requested amount
                </p>
                <p className="m-0 font-mono text-(--color-accent-hover) font-semibold">
                  {snapshot.workflow.pendingAmount}
                </p>
              </div>
              <div>
                <p className="text-[10.5px] tracking-wide uppercase text-(--color-mist) mb-1">
                  Recipient
                </p>
                <a
                  href={explorerAddress(snapshot.workflow.pendingRecipient)}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-[12px] break-all hover:text-(--color-accent)"
                >
                  {snapshot.workflow.pendingRecipient}
                </a>
              </div>
            </div>

            <div className="flex gap-2.5">
              <button
                onClick={() => onResume(true)}
                disabled={resumeStatus === 'submitting'}
                className="inline-flex items-center gap-2 rounded-lg bg-(--color-accent) text-white font-medium text-[13.5px] px-5 py-2 transition-colors hover:bg-(--color-accent-hover) disabled:opacity-50"
              >
                {resumeStatus === 'submitting' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Approve
              </button>
              <button
                onClick={() => onResume(false)}
                disabled={resumeStatus === 'submitting'}
                className="inline-flex items-center gap-2 rounded-lg border border-(--color-hairline) font-medium text-[13.5px] px-5 py-2 transition-colors hover:border-red-400 hover:text-red-700 disabled:opacity-50"
              >
                Reject
              </button>
            </div>

            {resumeError && (
              <p className="mt-3 text-[13px] text-red-700 flex items-center gap-1.5">
                <CircleAlert className="w-3.5 h-3.5 shrink-0" /> {resumeError}
              </p>
            )}
            {resumeSignature && (
              <p className="mt-3 text-[13px] text-(--color-accent-hover) flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> Resolved —{' '}
                <a
                  href={explorerTx(resumeSignature)}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono underline"
                >
                  view transaction
                </a>
              </p>
            )}
          </>
        ) : (
          <p className="text-[13.5px] text-(--color-mist) m-0">
            Current status: <span className="font-mono">{snapshot.workflow.status}</span>. Nothing
            to resolve here — this section only activates when a spend-cap breach has genuinely
            paused a workflow.
          </p>
        )}
      </section>
    </div>
  );
}
