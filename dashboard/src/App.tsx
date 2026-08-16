import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Sidebar } from './components/Sidebar.js';
import { ToastProvider } from './components/Toast.js';
import { Agent } from './pages/Agent.js';
import { Overview } from './pages/Overview.js';
import { Workflows } from './pages/Workflows.js';
import { Approvals } from './pages/Approvals.js';
import { Settlements } from './pages/Settlements.js';
import { Verifier } from './pages/Verifier.js';
import { Receipts } from './pages/Receipts.js';
import { GuardrailPolicy } from './pages/GuardrailPolicy.js';
import { Settings } from './pages/Settings.js';
import { useLiveEvents } from './hooks/useLiveEvents.js';
import { RELAY_URL, type WorkflowsListResponse } from './types.js';

export type Page =
  | 'agent'
  | 'overview'
  | 'workflows'
  | 'approvals'
  | 'settlements'
  | 'verifier'
  | 'receipts'
  | 'guardrail-policy'
  | 'settings';

const TITLES: Record<Page, string> = {
  agent: 'Agent',
  overview: 'Overview',
  workflows: 'Workflows',
  approvals: 'Approvals',
  settlements: 'Settlements',
  verifier: 'Verifier',
  receipts: 'Receipts',
  'guardrail-policy': 'Guardrail policy',
  settings: 'Settings',
};

function AppShell() {
  const [page, setPage] = useState<Page>('agent');
  const [verifyPrefill, setVerifyPrefill] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [connected, setConnected] = useState<boolean | null>(null);

  // Real count for the sidebar badge, independent of whichever page is currently showing — a
  // cheap extra fetch rather than plumbing shared state across every page just for one number.
  // Same poll also doubles as a real relay-reachability check for the header's status dot. The
  // 30s interval is just a fallback net — useLiveEvents below triggers an instant refresh the
  // moment a real approval/rejection or workflow event actually happens anywhere.
  function refreshPendingCount() {
    fetch(`${RELAY_URL}/workflows?limit=300`)
      .then((res) => res.json() as Promise<WorkflowsListResponse>)
      .then((data) => {
        setPendingCount(data.items.filter((w) => w.status === 'pendingOverrideApproval').length);
        setConnected(true);
      })
      .catch(() => setConnected(false));
  }

  useEffect(() => {
    refreshPendingCount();
    const interval = setInterval(refreshPendingCount, 30_000);
    return () => clearInterval(interval);
  }, []);

  useLiveEvents(refreshPendingCount);

  function goVerify(pda: string) {
    setVerifyPrefill(pda);
    setPage('verifier');
  }

  return (
    <div className="min-h-screen flex bg-(--color-paper)">
      <Sidebar page={page} onNavigate={setPage} pendingCount={pendingCount} />

      <main className="flex-1 min-w-0 dot-grid">
        <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-xl border-b border-(--color-hairline) px-8 py-5 flex items-center justify-between">
          <div>
            <p className="text-[11px] tracking-wide uppercase text-(--color-mist) m-0 mb-0.5">Dashboard</p>
            <h1 className="font-extrabold text-[22px] tracking-tight m-0">{TITLES[page]}</h1>
          </div>
          <div className="flex items-center gap-1.5 text-[11.5px] text-(--color-mist)">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                connected === null ? 'bg-(--color-mist)' : connected ? 'bg-(--color-accent) animate-pulse' : 'bg-red-500'
              }`}
            />
            {connected === null ? 'connecting…' : connected ? 'relay connected' : 'relay unreachable'}
          </div>
        </header>

        <div className="px-8 py-6 max-w-[1200px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={page}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            >
              {page === 'agent' && <Agent onVerify={goVerify} />}
              {page === 'overview' && <Overview onVerify={goVerify} />}
              {page === 'workflows' && <Workflows onVerify={goVerify} />}
              {page === 'approvals' && <Approvals />}
              {page === 'settlements' && <Settlements />}
              {page === 'verifier' && <Verifier prefill={verifyPrefill} />}
              {page === 'receipts' && <Receipts />}
              {page === 'guardrail-policy' && <GuardrailPolicy />}
              {page === 'settings' && <Settings />}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}

export function App() {
  return (
    <ToastProvider>
      <AppShell />
    </ToastProvider>
  );
}
