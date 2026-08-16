import { useEffect, useRef, useState } from 'react';
import { animate, motion, useInView } from 'motion/react';
import type { LucideIcon } from 'lucide-react';

export function StatCard({
  label,
  value,
  icon: Icon,
  accent,
  prefix = '',
  suffix = '',
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  accent?: boolean;
  prefix?: string;
  suffix?: string;
}) {
  const ref = useRef<HTMLParagraphElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!inView) return;
    const controls = animate(0, value, {
      duration: 0.8,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setDisplay(Number(v.toFixed(value % 1 !== 0 ? 2 : 0))),
    });
    return () => controls.stop();
  }, [inView, value]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="rounded-xl border border-(--color-hairline) bg-white p-5 flex flex-col gap-3 transition-shadow hover:shadow-md"
    >
      <div className="flex items-center justify-between">
        <p className="text-[11px] tracking-wide uppercase text-(--color-mist) m-0">{label}</p>
        <div
          className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
            accent ? 'bg-(--color-accent-soft)' : 'bg-(--color-surface)'
          }`}
        >
          <Icon className={`w-3.5 h-3.5 ${accent ? 'text-(--color-accent-hover)' : 'text-(--color-mist)'}`} />
        </div>
      </div>
      <p
        ref={ref}
        className={`font-extrabold text-[30px] tabular-nums tracking-tight m-0 ${
          accent ? 'text-(--color-accent)' : ''
        }`}
      >
        {prefix}
        {display}
        {suffix}
      </p>
    </motion.div>
  );
}
