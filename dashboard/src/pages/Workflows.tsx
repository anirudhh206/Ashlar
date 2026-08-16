import { useEffect, useMemo, useState } from 'react';
import { CircleAlert, ExternalLink, Loader2, Plus, SearchCheck } from 'lucide-react';
import { DeployDialog } from '../components/DeployDialog.js';
import {
  explorerAddress,
  RELAY_URL,
  short,
  type WorkflowsListResponse,
  type WorkflowSummary,
} from '../types.js';

const statusStyle: Record<string, string> = {
  completed: 'text-(--color-accent-hover) bg-(--color-accent-soft)',
  inProgress: 'text-blue-700 bg-blue-50',
  pendingOverrideApproval: 'text-amber-700 bg-amber-50',
  rejected: 'text-red-700 bg-red-50',
};

interface WorkflowsProps {
  onVerify: (pda: string) => void;
}

export function Workflows({ onVerify }: WorkflowsProps) {
  const [data, setData] = useState<WorkflowsListResponse | null>(null);
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [showDeploy, setShowDeploy] = useState(false);

  function load() {
    setStatus('loading');
    fetch(`${RELAY_URL}/workflows?limit=100`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`relay returned ${res.status}`);
        return res.json() as Promise<WorkflowsListResponse>;
      })
      .then((d) => {
        setData(d);
        setStatus('loaded');
      })
      .catch((err: Error) => {
        setError(err.message);
        setStatus('error');
      });
  }

  useEffect(load, []);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    if (!q) return data.items;
    return data.items.filter(
      (w: WorkflowSummary) =>
        w.pda.toLowerCase().includes(q) ||
        w.workflowId.includes(q) ||
        w.owner.toLowerCase().includes(q) ||
        w.workflowType.toLowerCase().includes(q) ||
        w.status.toLowerCase().includes(q),
    );
  }, [data, query]);

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <input
          type="text"
          placeholder="Search workflow id, address, owner, type, status…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 min-w-[240px] rounded-lg border border-(--color-hairline) bg-white px-3.5 py-2 text-[13px] outline-none focus:border-(--color-accent) transition-colors"
        />
        <button
          onClick={() => setShowDeploy(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-(--color-accent) text-white font-medium text-[13px] px-4 py-2 transition-colors hover:bg-(--color-accent-hover)"
        >
          <Plus className="w-4 h-4" /> New workflow
        </button>
      </div>

      {status === 'loading' && (
        <p className="text-[13.5px] text-(--color-mist) flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading real workflow accounts…
        </p>
      )}
      {status === 'error' && (
        <p className="text-[13.5px] text-red-700 flex items-center gap-1.5">
          <CircleAlert className="w-4 h-4 shrink-0" /> {error}
        </p>
      )}

      {status === 'loaded' && data && (
        <>
          <p className="text-[12.5px] text-(--color-mist) mb-3">
            Showing {filtered.length} of {data.total} real WorkflowInstance accounts on this
            program — every deploy, load test, and adversarial run this project has ever done.
          </p>
          <div className="rounded-xl border border-(--color-hairline) bg-white overflow-hidden">
            <table className="w-full text-[13px] border-collapse">
              <thead>
                <tr className="border-b border-(--color-hairline) text-left">
                  <th className="px-4 py-2.5 font-medium text-(--color-mist) text-[11px] uppercase tracking-wide">Workflow</th>
                  <th className="px-4 py-2.5 font-medium text-(--color-mist) text-[11px] uppercase tracking-wide">Type</th>
                  <th className="px-4 py-2.5 font-medium text-(--color-mist) text-[11px] uppercase tracking-wide">Status</th>
                  <th className="px-4 py-2.5 font-medium text-(--color-mist) text-[11px] uppercase tracking-wide">Spend cap</th>
                  <th className="px-4 py-2.5 font-medium text-(--color-mist) text-[11px] uppercase tracking-wide">Step</th>
                  <th className="px-4 py-2.5 font-medium text-(--color-mist) text-[11px] uppercase tracking-wide"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 50).map((w) => (
                  <tr key={w.pda} className="border-b border-(--color-hairline) last:border-0 hover:bg-(--color-surface) transition-colors">
                    <td className="px-4 py-2.5">
                      <a
                        href={explorerAddress(w.pda)}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono text-[12px] hover:text-(--color-accent) inline-flex items-center gap-1"
                      >
                        {short(w.pda)} <ExternalLink className="w-3 h-3" />
                      </a>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[12px] text-(--color-mist)">{w.workflowType}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-[11px] font-semibold rounded-full px-2 py-0.5 ${statusStyle[w.status] ?? 'bg-(--color-surface) text-(--color-mist)'}`}>
                        {w.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[12px]">${w.spendCap}</td>
                    <td className="px-4 py-2.5 text-[12px]">{w.currentStep}/4</td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        onClick={() => onVerify(w.pda)}
                        className="inline-flex items-center gap-1 text-[12px] font-medium text-(--color-accent) hover:text-(--color-accent-hover)"
                      >
                        <SearchCheck className="w-3.5 h-3.5" /> Verify
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {showDeploy && (
        <DeployDialog
          onClose={() => setShowDeploy(false)}
          onDeployed={() => {
            setShowDeploy(false);
            load();
          }}
        />
      )}
    </div>
  );
}
