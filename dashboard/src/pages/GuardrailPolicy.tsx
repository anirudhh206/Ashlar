import { motion } from 'motion/react';
import { Bot, KeyRound, ShieldCheck, Users } from 'lucide-react';

const rules = [
  {
    icon: ShieldCheck,
    title: 'Spend cap',
    body: 'guardrail_check compares the requested amount against the workflow\'s spend_cap, set once at initialize_workflow and never mutable afterward. A request over the cap pauses to PendingOverrideApproval — it is never silently allowed through.',
    enforced: true,
  },
  {
    icon: KeyRound,
    title: 'Recipient allowlist',
    body: 'The same guardrail_check instruction rejects any recipient not in the workflow\'s allowlist outright (terminal Rejected, not resumable) — this is the one on-chain boundary nothing off-chain, including a compromised agent, can talk around.',
    enforced: true,
  },
  {
    icon: Bot,
    title: 'Zero AI signing authority',
    body: 'The agent (agent/src/tools.ts) has exactly 5 typed tool schemas — 4 that each call one specific on-chain instruction, plus one read-only invoice lookup. It cannot construct a transaction, and the recipient/workflow id it acts on are bound by the calling harness, never supplied by the model.',
    enforced: true,
  },
  {
    icon: Users,
    title: 'Owner-only override',
    body: 'resume_after_override requires has_one = owner, checked by the on-chain program itself — only a transaction signed by the real workflow owner can resolve a paused, over-cap request. Nothing else can.',
    enforced: true,
  },
];

export function GuardrailPolicy() {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] text-(--color-mist) mb-1 max-w-[70ch]">
        What's actually enforced by the on-chain program today — not a policy document, a
        description of real code in <code className="font-mono text-[12px]">programs/ashlar/src</code>.
      </p>
      {rules.map((r, i) => {
        const Icon = r.icon;
        return (
          <motion.div
            key={r.title}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: i * 0.06 }}
            className="rounded-xl border border-(--color-hairline) bg-white p-5 flex gap-4 transition-shadow hover:shadow-md"
          >
            <div className="w-9 h-9 rounded-lg bg-(--color-accent-soft) flex items-center justify-center shrink-0">
              <Icon className="w-4.5 h-4.5 text-(--color-accent-hover)" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1.5">
                <h3 className="font-semibold text-[14px] m-0">{r.title}</h3>
                {r.enforced && (
                  <span className="text-[10px] font-bold tracking-wide uppercase text-(--color-accent-hover) bg-(--color-accent-soft) rounded-full px-2 py-0.5">
                    Enforced
                  </span>
                )}
              </div>
              <p className="text-[13px] text-(--color-mist) leading-relaxed m-0">{r.body}</p>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
