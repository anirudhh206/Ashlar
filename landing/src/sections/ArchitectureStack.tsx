import { Bot, ShieldCheck, Users, ChevronDown, CheckCircle2 } from 'lucide-react';
import { Reveal } from '../components/Reveal';
import { architectureLayers } from '../lib/facts';

const icons = { bot: Bot, 'shield-check': ShieldCheck, users: Users };
const shades = ['bg-(--color-surface)', 'bg-[#e9e9ec]', 'bg-[#d8d8dd]'];

export function ArchitectureStack() {
  return (
    <section className="max-w-[1200px] mx-auto px-6 sm:px-10 py-24">
      <span className="block text-[13px] tracking-[0.08em] uppercase text-(--color-accent) font-semibold mb-5">
        The architecture
      </span>
      <Reveal>
        <h2 className="font-extrabold text-[clamp(28px,3.4vw,42px)] tracking-tight max-w-[24ch] mb-14">
          Three layers stand between an instruction and your money.
        </h2>
      </Reveal>

      <div className="flex flex-col items-center max-w-[720px] mx-auto">
        {architectureLayers.map((layer, i) => {
          const Icon = icons[layer.icon as keyof typeof icons];
          return (
            <div key={layer.title} className="w-full">
              <Reveal delay={i * 0.1} className="w-full">
                <div
                  className={`w-full rounded-2xl border border-(--color-hairline) p-6 flex items-center gap-4 transition-transform hover:-translate-y-1 ${shades[i]}`}
                >
                  <Icon className="w-6 h-6 shrink-0" />
                  <div>
                    <p className="font-extrabold text-[17px] mb-1">{layer.title}</p>
                    <p className="text-sm text-(--color-mist) m-0">{layer.body}</p>
                  </div>
                </div>
              </Reveal>
              <div className="flex justify-center py-1.5">
                <ChevronDown className="w-5 h-5 text-(--color-accent) animate-bounce" />
              </div>
            </div>
          );
        })}
        <Reveal delay={0.3} className="w-full">
          <div className="w-full rounded-2xl bg-(--color-ink) text-white px-7 py-5 flex items-center gap-3 justify-center">
            <CheckCircle2 className="w-5 h-5" />
            <p className="font-extrabold text-[17px] m-0 tracking-tight">
              Only then does money move.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
