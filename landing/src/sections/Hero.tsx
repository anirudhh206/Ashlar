import { motion } from 'motion/react';

const blockRows: { flexes: number[]; height: number }[] = [
  { flexes: [2, 3, 1], height: 78 },
  { flexes: [1, 1], height: 60 },
  { flexes: [1, 2, 1, 1], height: 92 },
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

      <div className="relative flex flex-col gap-1 w-full max-w-[460px] justify-self-end" aria-hidden>
        {blockRows.map((row, ri) => (
          <div key={ri} className="flex gap-1" style={{ height: row.height }}>
            {row.flexes.map((flex, bi) => (
              <motion.div
                key={bi}
                initial={{ opacity: 0, y: 36, scale: 0.88 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{
                  duration: 0.65,
                  delay: 0.2 + (ri * 3 + bi) * 0.09,
                  ease: [0.16, 1, 0.3, 1],
                }}
                style={{ flex }}
                className="bg-(--color-surface) rounded-xl border border-(--color-hairline) hover:border-(--color-accent) transition-colors"
              />
            ))}
          </div>
        ))}
        <motion.div
          initial={{ opacity: 0, y: 36, scale: 0.88 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.65, delay: 0.65, ease: [0.16, 1, 0.3, 1] }}
          className="flex h-[112px] mt-1 rounded-xl bg-(--color-ink) text-white items-center px-6 font-extrabold text-[15px] tracking-tight"
        >
          COMPILED. FIXED. UNCHANGEABLE.
        </motion.div>
        <p className="text-[13px] leading-[1.6] text-(--color-mist) mt-3 max-w-[40ch]">
          Like an ashlar block — cut once, fits exactly, never moves. Once compiled, not even the
          AI can talk the program out of its steps.
        </p>
      </div>
    </section>
  );
}
