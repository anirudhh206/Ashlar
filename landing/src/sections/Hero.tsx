import { CheckCircle2, Circle, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';

const trace = [
  { label: 'fetch_step', detail: 'invoice #1042 · $5.00' },
  { label: 'manual_approval', detail: 'owner-signed · approved' },
  { label: 'guardrail_check', detail: 'within cap · allowlisted' },
  { label: 'mock_settlement', detail: 'x402 · Pyth-priced' },
];

export function Hero() {
  return (
    <section className="max-w-[1200px] mx-auto px-6 sm:px-10 grid lg:grid-cols-[1.15fr_0.85fr] gap-12 lg:gap-24 items-center pt-24 pb-20">
      <div>
        <motion.span
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="block text-[13px] tracking-[0.08em] uppercase text-(--color-accent) font-semibold mb-5"
        >
          Programmable financial workflows for AI agents · Solana
        </motion.span>

        <h1 className="font-extrabold text-[clamp(42px,5.6vw,84px)] leading-[1.03] tracking-tight m-0">
          {['Money that moves', 'itself — and proves', 'every step it took.'].map((line, i) => (
            <motion.span
              key={line}
              className="block"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.75, delay: 0.08 * i, ease: [0.2, 0.7, 0.2, 1] }}
            >
              {line}
            </motion.span>
          ))}
        </h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.75, delay: 0.4 }}
          className="text-lg leading-[1.6] max-w-[52ch] text-(--color-mist) mt-7"
        >
          Ashlar compiles one plain-English instruction into a fixed, self-running on-chain
          program. An AI agent watches and decides — but it never holds the keys. Every step is
          checked, every check is proof, and anyone can verify the whole thing without trusting
          us.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.75, delay: 0.5 }}
          className="flex gap-4 flex-wrap mt-9"
        >
          <a
            href="#case"
            className="inline-flex items-center rounded-full bg-(--color-accent) text-white font-semibold text-[15px] px-6 py-3 transition-transform hover:-translate-y-0.5 hover:bg-(--color-accent-hover)"
          >
            See a real settlement
          </a>
          <a
            href="#how"
            className="inline-flex items-center rounded-full border border-(--color-hairline) font-semibold text-[15px] px-6 py-3 transition-transform hover:-translate-y-0.5 hover:border-(--color-ink)"
          >
            How it works
          </a>
        </motion.div>
      </div>

      <div className="relative w-full max-w-[440px] justify-self-end" aria-hidden>
        {/* soft ambient glow behind the card — the depth cue modern SaaS heroes lean on */}
        <div
          className="absolute -inset-x-10 -inset-y-16 rounded-[50%] blur-3xl opacity-40 -z-10"
          style={{
            background:
              'radial-gradient(closest-side, var(--color-accent-glow), transparent 70%)',
          }}
        />

        <motion.div
          initial={{ opacity: 0, y: 28, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
          className="rounded-3xl bg-white/70 backdrop-blur-xl border border-(--color-hairline) shadow-[0_30px_60px_-20px_rgba(20,19,15,0.25)] p-6"
        >
          <div className="flex items-center justify-between mb-5">
            <span className="font-mono text-[11px] tracking-wide text-(--color-mist) uppercase">
              workflow trace
            </span>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-(--color-accent-hover) bg-(--color-accent-soft) rounded-full px-2.5 py-1">
              <Loader2 className="w-3 h-3 animate-spin" /> live
            </span>
          </div>

          <div className="flex flex-col gap-1">
            {trace.map((step, i) => (
              <motion.div
                key={step.label}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, delay: 0.6 + i * 0.35, ease: [0.2, 0.7, 0.2, 1] }}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-(--color-surface) transition-colors"
              >
                <motion.span
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.75 + i * 0.35, duration: 0.35, ease: 'backOut' }}
                >
                  <CheckCircle2 className="w-[18px] h-[18px] text-(--color-accent) shrink-0" />
                </motion.span>
                <div className="min-w-0">
                  <p className="font-mono text-[13px] font-medium m-0 truncate">{step.label}</p>
                  <p className="text-[12px] text-(--color-mist) m-0 truncate">{step.detail}</p>
                </div>
              </motion.div>
            ))}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 + trace.length * 0.35, duration: 0.4 }}
              className="flex items-center gap-3 px-3 py-2.5 opacity-40"
            >
              <Circle className="w-[18px] h-[18px] shrink-0" />
              <p className="font-mono text-[13px] m-0">attest_and_log</p>
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 + trace.length * 0.35 + 0.3, duration: 0.5 }}
            className="mt-4 pt-4 border-t border-(--color-hairline) flex items-center justify-between"
          >
            <span className="font-mono text-[12px] text-(--color-mist)">status</span>
            <span className="font-mono text-[12px] font-semibold text-(--color-ink)">
              Completed
            </span>
          </motion.div>
        </motion.div>

        <p className="text-[13px] leading-[1.6] text-(--color-mist) mt-4 max-w-[40ch]">
          Every one of these calls is a real, signed transaction on Solana devnet — not a mockup.
        </p>
      </div>
    </section>
  );
}
