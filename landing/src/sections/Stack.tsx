import {
  Bot,
  FileCode2,
  Link2,
  SearchCheck,
  ShieldHalf,
  Shuffle,
} from 'lucide-react';
import { Reveal } from '../components/Reveal';
import { stackPillars } from '../lib/facts';

const icons = {
  'file-code-2': FileCode2,
  'link-2': Link2,
  bot: Bot,
  'shield-half': ShieldHalf,
  shuffle: Shuffle,
  'search-check': SearchCheck,
};

export function Stack() {
  return (
    <section id="stack" className="max-w-[1200px] mx-auto px-6 sm:px-10 py-24">
      <span className="block text-[13px] tracking-[0.08em] uppercase text-(--color-accent) font-semibold mb-5">
        What's actually running
      </span>
      <Reveal>
        <h2 className="font-extrabold text-[clamp(28px,3.4vw,42px)] tracking-tight max-w-[30ch] mb-4">
          Verification is the payoff. Six real subsystems get you there.
        </h2>
      </Reveal>
      <Reveal delay={0.05}>
        <p className="text-[15.5px] leading-relaxed text-(--color-mist) max-w-[68ch] mb-14">
          Ashlar isn't a checker bolted onto someone else's payment flow — it's the compiler, the
          on-chain program, the agent, the custody layer, and the settlement rails, end to end.
          The verifier is just the layer that lets you stop trusting all the others.
        </p>
      </Reveal>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {stackPillars.map((pillar, i) => {
          const Icon = icons[pillar.icon as keyof typeof icons];
          return (
            <Reveal key={pillar.name} delay={(i % 3) * 0.08}>
              <div className="h-full rounded-2xl border border-(--color-hairline) bg-(--color-paper) p-6 transition-all hover:-translate-y-1 hover:shadow-lg hover:border-(--color-accent)/40">
                <div className="w-10 h-10 rounded-xl bg-(--color-accent-soft) flex items-center justify-center mb-4">
                  <Icon className="w-5 h-5 text-(--color-accent-hover)" />
                </div>
                <p className="text-[11px] tracking-wide uppercase text-(--color-mist) mb-1">
                  {pillar.tagline}
                </p>
                <h4 className="font-extrabold text-lg mb-2.5">{pillar.name}</h4>
                <p className="text-[14px] leading-relaxed text-(--color-mist) mb-4">
                  {pillar.body}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {pillar.tags.map((t) => (
                    <span
                      key={t}
                      className="text-[11px] font-medium text-(--color-ink)/70 bg-(--color-surface) rounded-full px-2.5 py-1"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}
