import {
  LayoutGrid,
  GitBranch,
  ShieldCheck,
  Receipt,
  SearchCheck,
  FileBadge,
  KeyRound,
  Settings as SettingsIcon,
  ArrowUpRight,
} from 'lucide-react';
import { LANDING_URL } from '../types.js';
import type { Page } from '../App.js';

const mainLinks: { id: Page; label: string; icon: typeof LayoutGrid }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutGrid },
  { id: 'workflows', label: 'Workflows', icon: GitBranch },
  { id: 'approvals', label: 'Approvals', icon: ShieldCheck },
  { id: 'settlements', label: 'Settlements', icon: Receipt },
  { id: 'verifier', label: 'Verifier', icon: SearchCheck },
  { id: 'receipts', label: 'Receipts', icon: FileBadge },
];

const systemLinks: { id: Page; label: string; icon: typeof LayoutGrid }[] = [
  { id: 'guardrail-policy', label: 'Guardrail policy', icon: KeyRound },
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
];

export function Sidebar({
  page,
  onNavigate,
  pendingCount,
}: {
  page: Page;
  onNavigate: (p: Page) => void;
  pendingCount: number;
}) {
  return (
    <aside className="w-[240px] shrink-0 bg-(--color-ink) text-white flex flex-col h-screen sticky top-0">
      <div className="px-5 py-4 border-b border-white/10 flex items-center gap-2.5">
        <span className="w-5 h-5 bg-(--color-accent) rounded-sm shrink-0" />
        <span className="font-extrabold tracking-tight text-[15px]">ASHLAR</span>
      </div>

      <nav className="flex flex-col px-3 py-3 gap-0.5 flex-1">
        {mainLinks.map((l) => {
          const Icon = l.icon;
          const active = page === l.id;
          return (
            <button
              key={l.id}
              onClick={() => onNavigate(l.id)}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] text-left transition-colors ${
                active ? 'bg-white/10 text-white font-medium' : 'text-white/60 hover:text-white hover:bg-white/5'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="flex-1">{l.label}</span>
              {l.id === 'approvals' && pendingCount > 0 && (
                <span className="bg-(--color-accent) text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 tabular-nums">
                  {pendingCount}
                </span>
              )}
            </button>
          );
        })}

        <p className="mt-5 mb-1.5 px-3 text-[10px] tracking-wide uppercase text-white/35">System</p>
        {systemLinks.map((l) => {
          const Icon = l.icon;
          const active = page === l.id;
          return (
            <button
              key={l.id}
              onClick={() => onNavigate(l.id)}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] text-left transition-colors ${
                active ? 'bg-white/10 text-white font-medium' : 'text-white/60 hover:text-white hover:bg-white/5'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {l.label}
            </button>
          );
        })}
      </nav>

      <a
        href={LANDING_URL}
        className="flex items-center gap-2 px-5 py-4 border-t border-white/10 text-[12px] text-white/60 hover:text-white transition-colors"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-(--color-accent-glow) shrink-0" />
        Solana devnet · about Ashlar
        <ArrowUpRight className="w-3 h-3 ml-auto" />
      </a>
    </aside>
  );
}
