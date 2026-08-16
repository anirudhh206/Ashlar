import { motion } from 'motion/react';
import {
  Bot,
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

function NavButton({
  id,
  label,
  icon: Icon,
  active,
  onNavigate,
  badge,
}: {
  id: Page;
  label: string;
  icon: typeof LayoutGrid;
  active: boolean;
  onNavigate: (p: Page) => void;
  badge?: number | undefined;
}) {
  return (
    <button
      onClick={() => onNavigate(id)}
      className={`relative flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] text-left transition-colors ${
        active ? 'text-white font-medium' : 'text-white/60 hover:text-white hover:bg-white/5'
      }`}
    >
      {active && (
        <motion.span
          layoutId="sidebar-active"
          className="absolute inset-0 rounded-lg bg-white/10"
          transition={{ type: 'spring', stiffness: 500, damping: 40 }}
        />
      )}
      <Icon className="w-4 h-4 shrink-0 relative" />
      <span className="flex-1 relative">{label}</span>
      {!!badge && badge > 0 && (
        <span className="relative bg-(--color-accent) text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 tabular-nums">
          {badge}
        </span>
      )}
    </button>
  );
}

export function Sidebar({
  page,
  onNavigate,
  pendingCount,
}: {
  page: Page;
  onNavigate: (p: Page) => void;
  pendingCount: number;
}) {
  const agentActive = page === 'agent';

  return (
    <aside className="w-[240px] shrink-0 bg-(--color-ink) text-white flex flex-col h-screen sticky top-0">
      <div className="px-5 py-4 border-b border-white/10 flex items-center">
        <span className="font-extrabold tracking-tight text-[15px]">ASHLAR</span>
      </div>

      {/* The flagship feature — visually distinct from the rest of the nav on purpose. This is
          the actual live Claude agent loop, not a settings-page-style list item. */}
      <div className="px-3 pt-4 pb-1">
        <motion.button
          onClick={() => onNavigate('agent')}
          whileHover={{ scale: 1.015 }}
          whileTap={{ scale: 0.985 }}
          className={`relative w-full flex items-center gap-3 rounded-xl px-3.5 py-3 text-left overflow-hidden ${
            agentActive
              ? 'bg-(--color-accent) text-white'
              : 'bg-gradient-to-br from-white/10 to-white/[0.03] text-white hover:from-white/[0.14]'
          }`}
        >
          {!agentActive && (
            <span
              className="absolute -inset-8 opacity-40 pointer-events-none"
              style={{
                background: 'radial-gradient(circle, var(--color-accent-glow), transparent 65%)',
              }}
            />
          )}
          <span
            className={`relative w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
              agentActive ? 'bg-white/20' : 'bg-(--color-accent)'
            }`}
          >
            <Bot className="w-4 h-4" />
          </span>
          <span className="relative flex-1 min-w-0">
            <span className="flex items-center gap-1.5">
              <span className="font-semibold text-[13.5px]">Agent</span>
              <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide bg-white/20 rounded-full px-1.5 py-0.5">
                <span className="w-1 h-1 rounded-full bg-(--color-accent-glow) animate-pulse" />
                Live
              </span>
            </span>
            <span className="block text-[11px] text-white/70">Talk to the real Claude loop</span>
          </span>
        </motion.button>
      </div>

      <nav className="flex flex-col px-3 py-3 gap-0.5 flex-1">
        {mainLinks.map((l) => (
          <NavButton
            key={l.id}
            id={l.id}
            label={l.label}
            icon={l.icon}
            active={page === l.id}
            onNavigate={onNavigate}
            badge={l.id === 'approvals' ? pendingCount : undefined}
          />
        ))}

        <p className="mt-5 mb-1.5 px-3 text-[10px] tracking-wide uppercase text-white/35">System</p>
        {systemLinks.map((l) => (
          <NavButton key={l.id} id={l.id} label={l.label} icon={l.icon} active={page === l.id} onNavigate={onNavigate} />
        ))}
      </nav>

      <a
        href={LANDING_URL}
        className="group flex items-center gap-2 px-5 py-4 border-t border-white/10 text-[12px] text-white/60 hover:text-white transition-colors"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-(--color-accent-glow) shrink-0 animate-pulse" />
        Solana devnet · about Ashlar
        <ArrowUpRight className="w-3 h-3 ml-auto transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
      </a>
    </aside>
  );
}
