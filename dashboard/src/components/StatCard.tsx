import type { LucideIcon } from 'lucide-react';

export function StatCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  accent?: boolean;
}) {
  return (
    <div className="rounded-xl border border-(--color-hairline) bg-white p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] tracking-wide uppercase text-(--color-mist) m-0">{label}</p>
        <Icon className="w-4 h-4 text-(--color-mist)" />
      </div>
      <p
        className={`font-extrabold text-[30px] tabular-nums tracking-tight m-0 ${
          accent ? 'text-(--color-accent)' : ''
        }`}
      >
        {value}
      </p>
    </div>
  );
}
