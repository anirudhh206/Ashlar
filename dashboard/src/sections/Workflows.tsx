import { type FormEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, CircleAlert, ExternalLink, Loader2, Radio } from 'lucide-react';
import {
  explorerAddress,
  formatTime,
  type AttestationEvent,
  type LedgerEntry,
  type WorkflowSnapshot,
} from '../types.js';

const outcomeStyle: Record<string, string> = {
  passed: 'text-(--color-accent-hover) bg-(--color-accent-soft)',
  executed: 'text-(--color-accent-hover) bg-(--color-accent-soft)',
  failed: 'text-red-700 bg-red-50',
  rejected: 'text-red-700 bg-red-50',
};

interface WorkflowsProps {
  instruction: string;
  onInstructionChange: (value: string) => void;
  deploySecret: string;
  onDeploySecretChange: (value: string) => void;
  deployStatus: 'idle' | 'deploying' | 'error';
  deployError: string | null;
  onDeploySubmit: (e: FormEvent) => void;

  workflowInput: string;
  onWorkflowInputChange: (value: string) => void;
  onWatchSubmit: (e: FormEvent) => void;

  watchedWorkflow: string | null;
  snapshot: WorkflowSnapshot | null;
  liveEvents: AttestationEvent[];
  error: string | null;
  displayedSteps: (LedgerEntry | AttestationEvent)[];
}

export function Workflows({
  instruction,
  onInstructionChange,
  deploySecret,
  onDeploySecretChange,
  deployStatus,
  deployError,
  onDeploySubmit,
  workflowInput,
  onWorkflowInputChange,
  onWatchSubmit,
  watchedWorkflow,
  snapshot,
  liveEvents,
  error,
  displayedSteps,
}: WorkflowsProps) {
  return (
    <div>
      <section className="rounded-xl border border-(--color-hairline) bg-white p-5 mb-4">
        <h2 className="font-semibold text-[15px] mb-1">Deploy a workflow</h2>
        <p className="text-[13px] text-(--color-mist) mb-1.5">
          Compiles a real instruction and runs it through all 5 gates on Solana devnet — a real
          transaction, not a mockup.
        </p>
        <p className="text-[12px] text-(--color-mist) mb-4 flex items-start gap-1.5">
          <CircleAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          This token matches <code className="font-mono">DASHBOARD_DEPLOY_SECRET</code> on your
          own relay — real spending authority, not a login. Only enter it if you're running this
          dashboard yourself against your own relay. Kept in this tab's session only.
        </p>
        <form onSubmit={onDeploySubmit} className="flex flex-col gap-2.5">
          <input
            type="text"
            placeholder='e.g. "Pay up to $50 every Friday to allowlisted vendors."'
            value={instruction}
            onChange={(e) => onInstructionChange(e.target.value)}
            className="w-full rounded-lg border border-(--color-hairline) bg-(--color-surface) px-3.5 py-2 text-[13.5px] font-mono outline-none focus:border-(--color-accent) transition-colors"
          />
          <div className="flex gap-2.5 flex-wrap">
            <input
              type="password"
              placeholder="Operator token"
              value={deploySecret}
              onChange={(e) => onDeploySecretChange(e.target.value)}
              className="flex-1 min-w-[160px] rounded-lg border border-(--color-hairline) bg-(--color-surface) px-3.5 py-2 text-[13.5px] outline-none focus:border-(--color-accent) transition-colors"
            />
            <button
              type="submit"
              disabled={deployStatus === 'deploying'}
              className="inline-flex items-center gap-2 rounded-lg bg-(--color-accent) text-white font-medium text-[13.5px] px-5 py-2 transition-colors hover:bg-(--color-accent-hover) disabled:opacity-50"
            >
              {deployStatus === 'deploying' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {deployStatus === 'deploying' ? 'Deploying…' : 'Deploy'}
            </button>
          </div>
        </form>
        {deployError && (
          <p className="mt-2.5 text-[13px] text-red-700 flex items-center gap-1.5">
            <CircleAlert className="w-3.5 h-3.5 shrink-0" /> {deployError}
          </p>
        )}
      </section>

      <section className="rounded-xl border border-(--color-hairline) bg-white p-5 mb-4">
        <h2 className="font-semibold text-[15px] mb-3">Watch a workflow</h2>
        <form onSubmit={onWatchSubmit} className="flex gap-2.5 flex-wrap">
          <input
            type="text"
            placeholder="Workflow PDA address"
            value={workflowInput}
            onChange={(e) => onWorkflowInputChange(e.target.value)}
            className="flex-1 min-w-[220px] rounded-lg border border-(--color-hairline) bg-(--color-surface) px-3.5 py-2 text-[13.5px] font-mono outline-none focus:border-(--color-accent) transition-colors"
          />
          <button
            type="submit"
            className="inline-flex items-center rounded-lg border border-(--color-hairline) font-medium text-[13.5px] px-5 py-2 transition-colors hover:border-(--color-ink)"
          >
            Watch
          </button>
        </form>
      </section>

      {error && (
        <p className="text-[13px] text-red-700 flex items-center gap-1.5 mb-4">
          <CircleAlert className="w-3.5 h-3.5 shrink-0" /> {error}
        </p>
      )}

      {snapshot && (
        <section className="rounded-xl border border-(--color-hairline) bg-(--color-surface) p-5 mb-4">
          <div className="grid sm:grid-cols-2 gap-3.5 text-[13.5px]">
            <div>
              <p className="text-[10.5px] tracking-wide uppercase text-(--color-mist) mb-1">
                Owner
              </p>
              <a
                href={explorerAddress(snapshot.workflow.owner)}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-[12px] break-all inline-flex items-center gap-1 hover:text-(--color-accent)"
              >
                {snapshot.workflow.owner} <ExternalLink className="w-3 h-3 shrink-0" />
              </a>
            </div>
            <div>
              <p className="text-[10.5px] tracking-wide uppercase text-(--color-mist) mb-1">
                Type
              </p>
              <p className="m-0 font-mono text-[12px]">{snapshot.workflow.workflowType}</p>
            </div>
            <div>
              <p className="text-[10.5px] tracking-wide uppercase text-(--color-mist) mb-1">
                Status
              </p>
              <p className="m-0 font-semibold">{snapshot.workflow.status}</p>
            </div>
            <div>
              <p className="text-[10.5px] tracking-wide uppercase text-(--color-mist) mb-1">
                Step
              </p>
              <p className="m-0">{snapshot.workflow.currentStep}</p>
            </div>
          </div>
        </section>
      )}

      {watchedWorkflow && (
        <section className="rounded-xl border border-(--color-hairline) bg-white p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-[15px] m-0">Attestations</h2>
            {liveEvents.length > 0 && (
              <span className="inline-flex items-center gap-1.5 text-[10.5px] font-semibold text-(--color-accent-hover) bg-(--color-accent-soft) rounded-full px-2 py-0.5">
                <Radio className="w-3 h-3 animate-pulse" /> live
              </span>
            )}
          </div>
          {displayedSteps.length === 0 && (
            <p className="text-[13.5px] text-(--color-mist)">No steps attested yet.</p>
          )}
          <ul className="flex flex-col gap-0.5 list-none p-0 m-0">
            <AnimatePresence initial={false}>
              {displayedSteps.map((step, i) => (
                <motion.li
                  key={`${step.stepIndex}-${i}`}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-center gap-3 rounded-lg px-2.5 py-2 hover:bg-(--color-surface) transition-colors"
                >
                  <CheckCircle2 className="w-4 h-4 text-(--color-accent) shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-[12.5px] font-medium m-0">
                      step {step.stepIndex}: {step.stepKind}
                    </p>
                    <p className="text-[11.5px] text-(--color-mist) m-0">
                      {formatTime(step.timestamp)}
                    </p>
                  </div>
                  <span
                    className={`text-[10.5px] font-semibold rounded-full px-2 py-0.5 shrink-0 ${
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
    </div>
  );
}
