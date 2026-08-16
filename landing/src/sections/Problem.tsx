import { Reveal } from '../components/Reveal';

const cards = [
  { title: 'Identity', body: 'Proves who the agent is.', gap: false },
  { title: 'Permission', body: 'Proves it was allowed to act.', gap: false },
  { title: 'Reserves', body: 'Proves the funds exist.', gap: false },
  {
    title: 'The process',
    body: 'Proves the entire multi-step process ran correctly, in order — checkable by a stranger, with no need to trust Ashlar.',
    gap: true,
  },
];

export function Problem() {
  return (
    <section className="max-w-[1200px] mx-auto px-6 sm:px-10 py-24">
      <span className="block text-[13px] tracking-[0.08em] uppercase text-(--color-accent) font-semibold mb-5">
        The problem
      </span>
      <Reveal>
        <h2 className="font-extrabold text-[clamp(28px,3.4vw,42px)] tracking-tight leading-[1.1] max-w-[22ch] mb-14">
          Every trust tool proves one narrow slice. Nothing proves the whole process ran.
        </h2>
      </Reveal>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c, i) => (
          <Reveal key={c.title} delay={i * 0.08}>
            <div
              className={`h-full rounded-2xl p-6 border transition-all hover:-translate-y-1 hover:shadow-lg ${
                c.gap
                  ? 'bg-(--color-accent-soft) border-(--color-accent)/20'
                  : 'bg-(--color-surface) border-(--color-hairline)'
              }`}
            >
              {c.gap && (
                <span className="inline-block text-[11px] font-semibold tracking-wide text-(--color-accent-hover) bg-white rounded-full px-2.5 py-1 mb-3">
                  THE GAP
                </span>
              )}
              <h4 className={`font-extrabold text-base mb-2 ${c.gap ? 'text-(--color-accent-hover)' : ''}`}>
                {c.title}
              </h4>
              <p className="text-[14.5px] leading-relaxed text-(--color-mist) m-0">{c.body}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
