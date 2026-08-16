import { useRef, useState } from 'react';
import { motion, useMotionValueEvent, useScroll } from 'motion/react';
import { howItWorks } from '../lib/facts';

export function HowItWorks() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end end'],
  });

  useMotionValueEvent(scrollYProgress, 'change', (v) => {
    const idx = Math.min(howItWorks.length - 1, Math.floor(v * howItWorks.length));
    setActive(Math.max(0, idx));
  });

  return (
    <section id="how" className="bg-(--color-ink) text-white">
      <div className="max-w-[1200px] mx-auto px-6 sm:px-10 pt-24 pb-4">
        <span className="block text-[13px] tracking-[0.08em] uppercase text-(--color-accent-glow) font-semibold mb-5">
          How it works
        </span>
        <h2 className="font-extrabold text-[clamp(28px,3.4vw,42px)] tracking-tight max-w-[20ch] mb-4">
          Eight courses, laid in order. None skippable.
        </h2>
      </div>

      {/* Scroll-pinned storytelling: this container is tall; the inner panel sticks to the
          viewport while scroll progress through it drives which step is highlighted. */}
      <div ref={containerRef} style={{ height: `${howItWorks.length * 70}vh` }} className="relative">
        <div className="sticky top-0 h-screen flex items-center overflow-hidden">
          <div className="max-w-[1200px] mx-auto px-6 sm:px-10 w-full grid lg:grid-cols-[160px_1fr] gap-8 lg:gap-16 items-center">
            {/* index rail */}
            <div className="hidden lg:flex flex-col gap-3">
              {howItWorks.map((step, i) => (
                <div key={step.n} className="flex items-center gap-3">
                  <span
                    className={`w-2 h-2 rounded-full transition-colors ${
                      i === active ? 'bg-(--color-accent-glow)' : 'bg-white/20'
                    }`}
                  />
                  <span
                    className={`font-extrabold text-sm tabular-nums transition-colors ${
                      i === active ? 'text-white' : 'text-white/30'
                    }`}
                  >
                    {step.n}
                  </span>
                </div>
              ))}
            </div>

            {/* active step detail */}
            <div className="min-h-[260px]">
              <motion.p
                key={`${active}-n`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="font-extrabold text-sm tabular-nums text-(--color-accent-glow) mb-4"
              >
                {howItWorks[active]!.n} / {String(howItWorks.length).padStart(2, '0')}
              </motion.p>
              <motion.h3
                key={`${active}-t`}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: [0.2, 0.7, 0.2, 1] }}
                className="font-extrabold text-[clamp(28px,4vw,52px)] tracking-tight mb-5"
              >
                {howItWorks[active]!.title}
              </motion.h3>
              <motion.p
                key={`${active}-b`}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.08, ease: [0.2, 0.7, 0.2, 1] }}
                className="text-lg leading-relaxed text-white/70 max-w-[62ch] m-0"
              >
                {howItWorks[active]!.body}
              </motion.p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
