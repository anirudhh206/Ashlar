import { useState, type FormEvent } from 'react';
import { CircleAlert, Loader2, X } from 'lucide-react';
import { RELAY_URL } from '../types.js';

interface DeployDialogProps {
  onClose: () => void;
  onDeployed: (workflowPda: string) => void;
}

export function DeployDialog({ onClose, onDeployed }: DeployDialogProps) {
  const [instruction, setInstruction] = useState('');
  const [status, setStatus] = useState<'idle' | 'deploying' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!instruction.trim()) return;
    setStatus('deploying');
    setError(null);

    try {
      const res = await fetch(`${RELAY_URL}/deploy`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ instruction: instruction.trim() }),
      });
      if (!res.ok) throw new Error(`relay returned ${res.status}: ${await res.text()}`);
      const { workflowPda } = (await res.json()) as { workflowPda: string };
      onDeployed(workflowPda);
    } catch (err) {
      setStatus('error');
      setError((err as Error).message);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-6">
      <div className="w-full max-w-[520px] rounded-2xl bg-white border border-(--color-hairline) p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-semibold text-[16px] m-0">New workflow</h2>
          <button onClick={onClose} className="text-(--color-mist) hover:text-(--color-ink)">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-[13px] text-(--color-mist) mb-5">
          Compiles a real instruction and runs it through all 5 gates on Solana devnet — a real
          transaction, not a mockup. Authorized automatically: this relay only accepts deploy
          requests from the same machine it runs on.
        </p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            autoFocus
            type="text"
            placeholder='e.g. "Pay up to $50 every Friday to allowlisted vendors."'
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            className="w-full rounded-lg border border-(--color-hairline) bg-(--color-surface) px-3.5 py-2.5 text-[13.5px] font-mono outline-none focus:border-(--color-accent) transition-colors"
          />
          <div className="flex gap-2.5 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-(--color-hairline) font-medium text-[13.5px] px-4 py-2 transition-colors hover:border-(--color-ink)"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={status === 'deploying'}
              className="inline-flex items-center gap-2 rounded-lg bg-(--color-accent) text-white font-medium text-[13.5px] px-5 py-2 transition-colors hover:bg-(--color-accent-hover) disabled:opacity-50"
            >
              {status === 'deploying' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {status === 'deploying' ? 'Deploying…' : 'Deploy'}
            </button>
          </div>
        </form>
        {error && (
          <p className="mt-3 text-[13px] text-red-700 flex items-center gap-1.5">
            <CircleAlert className="w-3.5 h-3.5 shrink-0" /> {error}
          </p>
        )}
      </div>
    </div>
  );
}
