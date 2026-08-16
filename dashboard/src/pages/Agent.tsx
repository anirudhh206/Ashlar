import { useEffect, useRef, useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Bot,
  CheckCircle2,
  CircleAlert,
  ExternalLink,
  Loader2,
  PauseCircle,
  Sparkles,
  Wrench,
  XCircle,
  Zap,
} from 'lucide-react';
import { useToast } from '../components/Toast.js';
import {
  RELAY_URL,
  explorerAddress,
  short,
  type AgentEvent,
  type AgentEventMessage,
  type MockInvoice,
} from '../types.js';

interface AgentProps {
  onVerify: (pda: string) => void;
}

type TranscriptItem = { id: number; event: AgentEvent };

function ToolCallLine({ item, resultItem }: { item: TranscriptItem; resultItem?: TranscriptItem | undefined }) {
  const call = item.event as Extract<AgentEvent, { type: 'tool_call' }>;
  const result = resultItem?.event as Extract<AgentEvent, { type: 'tool_result' }> | undefined;
  const resultData = result?.result as { signature?: string; error?: string } | undefined;

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      className="rounded-lg bg-white/5 border border-white/10 px-4 py-3"
    >
      <div className="flex items-center gap-2 mb-1">
        <Wrench className="w-3.5 h-3.5 text-(--color-accent-glow) shrink-0" />
        <span className="font-mono text-[12.5px] text-white">
          {call.name}
          <span className="text-white/50">({JSON.stringify(call.input)})</span>
        </span>
        {!result && <Loader2 className="w-3 h-3 animate-spin text-white/40 ml-auto shrink-0" />}
      </div>
      {result && (
        <div className="pl-5.5 flex items-center gap-2 text-[11.5px]">
          {resultData?.error ? (
            <>
              <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
              <span className="text-red-300">{resultData.error}</span>
            </>
          ) : (
            <>
              <CheckCircle2 className="w-3.5 h-3.5 text-(--color-accent-glow) shrink-0" />
              <span className="text-white/60">on-chain confirmed</span>
              {resultData?.signature && (
                <a
                  href={explorerAddress(resultData.signature)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-(--color-accent-glow) hover:text-white font-mono"
                >
                  {short(resultData.signature)} <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </>
          )}
        </div>
      )}
    </motion.div>
  );
}

export function Agent({ onVerify }: AgentProps) {
  const [instruction, setInstruction] = useState('Transfer $5 to Acme Corp, pending my approval.');
  const [invoices, setInvoices] = useState<MockInvoice[] | null>(null);
  const [invoiceId, setInvoiceId] = useState<number>(1);
  const [status, setStatus] = useState<'idle' | 'starting' | 'running' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [workflowPda, setWorkflowPda] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptItem[]>([]);
  const [outcome, setOutcome] = useState<AgentEvent | null>(null);
  const idCounter = useRef(0);
  const toast = useToast();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`${RELAY_URL}/invoices`)
      .then((res) => res.json() as Promise<{ invoices: MockInvoice[] }>)
      .then((d) => {
        setInvoices(d.invoices);
        if (d.invoices[0]) setInvoiceId(d.invoices[0].id);
      })
      .catch(() => setInvoices([]));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [transcript]);

  async function handleTrigger(e: FormEvent) {
    e.preventDefault();
    if (!instruction.trim() || status === 'starting' || status === 'running') return;

    setStatus('starting');
    setError(null);
    setTranscript([]);
    setOutcome(null);
    setWorkflowPda(null);

    try {
      const res = await fetch(`${RELAY_URL}/agent/trigger`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ instruction: instruction.trim(), invoiceId }),
      });
      if (!res.ok) throw new Error(`relay returned ${res.status}: ${await res.text()}`);
      const { workflowPda: pda } = (await res.json()) as { workflowPda: string };
      setWorkflowPda(pda);
      setStatus('running');
      toast.push('success', 'Workflow initialized — handing off to the live agent now.');

      const source = new EventSource(`${RELAY_URL}/events?workflow=${pda}`);
      source.onmessage = (msg) => {
        const parsed = JSON.parse(msg.data) as { type: string };
        if (parsed.type !== 'agent') return;
        const { event } = parsed as AgentEventMessage;
        idCounter.current += 1;
        setTranscript((prev) => [...prev, { id: idCounter.current, event }]);
        if (event.type === 'paused' || event.type === 'finished' || event.type === 'max_turns' || event.type === 'error') {
          setOutcome(event);
          setStatus('idle');
          source.close();
        }
      };
      source.onerror = () => {
        source.close();
      };
    } catch (err) {
      setStatus('error');
      setError((err as Error).message);
      toast.push('error', 'Could not start the agent — see the error below.');
    }
  }

  // tool_call and tool_result are emitted strictly alternating and in order (the agent loop
  // awaits each tool's execution before moving to the next), so pairing them up by position is
  // reliable — build that pairing once per render rather than re-deriving it inline per item.
  const toolCalls = transcript.filter((t) => t.event.type === 'tool_call');
  const toolResults = transcript.filter((t) => t.event.type === 'tool_result');
  const resultByCallId = new Map<number, TranscriptItem>();
  toolCalls.forEach((callItem, i) => {
    const resultItem = toolResults[i];
    if (resultItem) resultByCallId.set(callItem.id, resultItem);
  });

  return (
    <div className="flex flex-col gap-5">
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-(--color-hairline) bg-white p-6"
      >
        <div className="flex items-center gap-2.5 mb-1.5">
          <Sparkles className="w-5 h-5 text-(--color-accent)" />
          <h2 className="font-extrabold text-[17px] m-0">Give the agent something to do</h2>
        </div>
        <p className="text-[13px] text-(--color-mist) mb-5 max-w-[70ch]">
          This is the real thing — a live Claude tool-use loop (<code className="font-mono text-[12px]">agent/src/driveWorkflow.ts</code>)
          with exactly 5 typed tools and zero signing authority. It reads a real mock invoice,
          decides what to do, and every decision it makes calls a real on-chain instruction. You're
          watching the model reason, not a script.
        </p>

        <form onSubmit={handleTrigger} className="flex flex-col gap-3.5">
          <input
            type="text"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder='e.g. "Transfer $5 to Acme Corp, pending my approval."'
            className="w-full rounded-lg border border-(--color-hairline) bg-(--color-surface) px-3.5 py-2.5 text-[13.5px] font-mono outline-none focus:border-(--color-accent) transition-colors"
          />

          <div>
            <p className="text-[11px] tracking-wide uppercase text-(--color-mist) mb-2">
              Trigger invoice — real data from <code className="font-mono text-[10.5px]">agent/src/mockInvoices.ts</code>
            </p>
            <div className="grid sm:grid-cols-3 gap-2">
              {(invoices ?? []).map((inv) => (
                <button
                  type="button"
                  key={inv.id}
                  onClick={() => setInvoiceId(inv.id)}
                  className={`text-left rounded-lg border px-3 py-2.5 transition-colors ${
                    invoiceId === inv.id
                      ? 'border-(--color-accent) bg-(--color-accent-soft)'
                      : 'border-(--color-hairline) hover:border-(--color-ink)'
                  }`}
                >
                  <p className="text-[12.5px] font-semibold m-0">
                    #{inv.id} · ${inv.amount} · {inv.vendor}
                  </p>
                  <p
                    className={`text-[11px] m-0 ${inv.status === 'approved' ? 'text-(--color-accent-hover)' : 'text-(--color-mist)'}`}
                  >
                    {inv.status}
                  </p>
                </button>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={status === 'starting' || status === 'running'}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-(--color-accent) text-white font-semibold text-[14px] py-3 transition-transform hover:-translate-y-0.5 hover:bg-(--color-accent-hover) disabled:opacity-50 disabled:hover:translate-y-0"
          >
            {status === 'starting' || status === 'running' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Zap className="w-4 h-4" />
            )}
            {status === 'starting'
              ? 'Initializing real workflow…'
              : status === 'running'
                ? 'Agent is deciding…'
                : 'Trigger the agent'}
          </button>
        </form>
        {error && (
          <p className="mt-3 text-[13px] text-red-700 flex items-center gap-1.5">
            <CircleAlert className="w-3.5 h-3.5 shrink-0" /> {error}
          </p>
        )}
      </motion.section>

      <AnimatePresence>
        {(workflowPda || status === 'running') && (
          <motion.section
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="rounded-2xl bg-(--color-ink) text-white p-6"
          >
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div className="flex items-center gap-2.5">
                <Bot className="w-5 h-5 text-(--color-accent-glow)" />
                <h2 className="font-extrabold text-[16px] m-0">Live agent transcript</h2>
              </div>
              {workflowPda && (
                <a
                  href={explorerAddress(workflowPda)}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-[11.5px] text-white/60 hover:text-white inline-flex items-center gap-1"
                >
                  {short(workflowPda)} <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>

            <div className="flex flex-col gap-2.5 max-h-[420px] overflow-y-auto pr-1">
              <AnimatePresence initial={false}>
                {transcript.map((item) => {
                  if (item.event.type === 'trigger') {
                    return (
                      <motion.p
                        key={item.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="text-[11.5px] text-white/40 font-mono m-0"
                      >
                        {(item.event as Extract<AgentEvent, { type: 'trigger' }>).message}
                      </motion.p>
                    );
                  }
                  if (item.event.type === 'assistant_text') {
                    return (
                      <motion.div
                        key={item.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="rounded-lg bg-white/[0.07] px-4 py-3"
                      >
                        <p className="text-[10px] tracking-wide uppercase text-(--color-accent-glow) mb-1 m-0">
                          Claude
                        </p>
                        <p className="text-[13px] text-white/90 leading-relaxed m-0">
                          {(item.event as Extract<AgentEvent, { type: 'assistant_text' }>).text}
                        </p>
                      </motion.div>
                    );
                  }
                  if (item.event.type === 'tool_call') {
                    return <ToolCallLine key={item.id} item={item} resultItem={resultByCallId.get(item.id)} />;
                  }
                  if (item.event.type === 'tool_result') return null; // rendered inline with its call
                  return null;
                })}
              </AnimatePresence>
              <div ref={bottomRef} />
            </div>

            <AnimatePresence>
              {outcome && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ ease: 'backOut', duration: 0.4 }}
                  className="mt-5 pt-5 border-t border-white/10"
                >
                  {outcome.type === 'finished' && (
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="w-5 h-5 text-(--color-accent-glow)" />
                      <div>
                        <p className="font-semibold text-[14px] m-0">
                          Workflow {outcome.status} — the agent's real decisions are done.
                        </p>
                        {workflowPda && (
                          <button
                            onClick={() => onVerify(workflowPda)}
                            className="text-[12.5px] text-(--color-accent-glow) hover:text-white underline mt-1"
                          >
                            Independently verify this run
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                  {outcome.type === 'paused' && (
                    <div className="flex items-center gap-3">
                      <PauseCircle className="w-5 h-5 text-amber-400" />
                      <p className="text-[14px] m-0">
                        Paused — requested {(outcome as Extract<AgentEvent, { type: 'paused' }>).pendingAmount}{' '}
                        exceeds the cap of {(outcome as Extract<AgentEvent, { type: 'paused' }>).spendCap}. The
                        agent has no override tool — this needs your real signature on the Approvals page.
                      </p>
                    </div>
                  )}
                  {outcome.type === 'max_turns' && (
                    <div className="flex items-center gap-3">
                      <CircleAlert className="w-5 h-5 text-amber-400" />
                      <p className="text-[14px] m-0">Stopped after the 10-turn safety cap.</p>
                    </div>
                  )}
                  {outcome.type === 'error' && (
                    <div className="flex items-center gap-3">
                      <XCircle className="w-5 h-5 text-red-400" />
                      <p className="text-[14px] m-0">{(outcome as Extract<AgentEvent, { type: 'error' }>).message}</p>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}
