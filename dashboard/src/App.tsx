import { useEffect, useState } from 'react';
import { Sidebar } from './components/Sidebar.js';
import { Overview } from './pages/Overview.js';
import { Workflows } from './pages/Workflows.js';
import { Approvals } from './pages/Approvals.js';
import { Settlements } from './pages/Settlements.js';
import { Verifier } from './pages/Verifier.js';
import { Receipts } from './pages/Receipts.js';
import { GuardrailPolicy } from './pages/GuardrailPolicy.js';
import { Settings } from './pages/Settings.js';
import { RELAY_URL, type WorkflowsListResponse } from './types.js';

export type Page =
  | 'overview'
  | 'workflows'
  | 'approvals'
  | 'settlements'
  | 'verifier'
  | 'receipts'
  | 'guardrail-policy'
  | 'settings';

const TITLES: Record<Page, string> = {
  overview: 'Overview',
  workflows: 'Workflows',
  approvals: 'Approvals',
  settlements: 'Settlements',
  verifier: 'Verifier',
  receipts: 'Receipts',
  'guardrail-policy': 'Guardrail policy',
  settings: 'Settings',
};

export function App() {
  const [page, setPage] = useState<Page>('overview');
  const [verifyPrefill, setVerifyPrefill] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);

  // Real count for the sidebar badge, independent of whichever page is currently showing — a
  // cheap extra fetch rather than plumbing shared state across every page just for one number.
  useEffect(() => {
    function refresh() {
      fetch(`${RELAY_URL}/workflows?limit=300`)
        .then((res) => res.json() as Promise<WorkflowsListResponse>)
        .then((data) => {
          setPendingCount(data.items.filter((w) => w.status === 'pendingOverrideApproval').length);
        })
        .catch(() => {});
    }
    refresh();
    const interval = setInterval(refresh, 30_000);
    return () => clearInterval(interval);
  }, []);

  function goVerify(pda: string) {
    setVerifyPrefill(pda);
    setPage('verifier');
  }

  return (
    <div className="min-h-screen flex bg-(--color-paper)">
      <Sidebar page={page} onNavigate={setPage} pendingCount={pendingCount} />

      <main className="flex-1 min-w-0">
        <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-xl border-b border-(--color-hairline) px-8 py-5">
          <p className="text-[11px] tracking-wide uppercase text-(--color-mist) m-0 mb-0.5">Dashboard</p>
          <h1 className="font-extrabold text-[22px] tracking-tight m-0">{TITLES[page]}</h1>
        </header>

        <div className="px-8 py-6 max-w-[1200px]">
          {page === 'overview' && <Overview onVerify={goVerify} />}
          {page === 'workflows' && <Workflows onVerify={goVerify} />}
          {page === 'approvals' && <Approvals />}
          {page === 'settlements' && <Settlements />}
          {page === 'verifier' && <Verifier prefill={verifyPrefill} />}
          {page === 'receipts' && <Receipts />}
          {page === 'guardrail-policy' && <GuardrailPolicy />}
          {page === 'settings' && <Settings />}
        </div>
      </main>
    </div>
  );
}
