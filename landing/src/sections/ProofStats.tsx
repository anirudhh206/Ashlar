import { Reveal } from '../components/Reveal';
import { CountUp } from '../components/CountUp';
import { proofStats } from '../lib/facts';

export function ProofStats() {
  return (
    <section id="proof" className="max-w-[1200px] mx-auto px-6 sm:px-10 py-24">
      <span className="block text-[13px] tracking-[0.08em] uppercase text-(--color-accent) font-semibold mb-5">
        Real proof, not a concept
      </span>
      <Reveal>
        <h2 className="font-extrabold text-[clamp(28px,3.4vw,42px)] tracking-tight max-w-[26ch] mb-14">
          Built and independently tested on real Solana devnet.
        </h2>
      </Reveal>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-10 gap-x-8">
        {proofStats.map((s, i) => (
          <Reveal key={s.label} delay={i * 0.05}>
            <div className="hover:-translate-y-1 transition-transform">
              <CountUp value={s.value} suffix={s.suffix} />
              <p className="text-[13px] tracking-wide uppercase text-(--color-mist) mt-1.5">
                {s.label}
              </p>
            </div>
          </Reveal>
        ))}
      </div>

      <Reveal delay={0.2}>
        <p className="text-[15.5px] leading-relaxed max-w-[70ch] mt-14 pt-8 border-t border-(--color-hairline) text-(--color-ink)/80">
          In three live prompt-injection attempts against the actual running agent, the model's
          own judgment resisted manipulation before the on-chain guardrail even had to act as
          backstop. Everything above runs on Solana devnet — real transactions, not a simulation.
        </p>
      </Reveal>
    </section>
  );
}
