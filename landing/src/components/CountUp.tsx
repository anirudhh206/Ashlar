import { useEffect, useRef, useState } from 'react';
import { animate, useInView } from 'motion/react';

export function CountUp({ value, suffix = '' }: { value: number; suffix?: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!inView) return;
    const controls = animate(0, value, {
      duration: 1.1,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setDisplay(Math.round(v)),
    });
    return () => controls.stop();
  }, [inView, value]);

  return (
    <p
      ref={ref}
      className="tabular-nums text-[clamp(34px,3.6vw,52px)] font-extrabold text-(--color-accent) m-0"
    >
      {display}
      {suffix}
    </p>
  );
}
