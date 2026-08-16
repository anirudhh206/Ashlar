import type { LucideIcon } from 'lucide-react';

export function EmptyState({
  icon: Icon,
  title,
  body,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
}) {
  return (
    <section className="rounded-xl border border-dashed border-(--color-hairline) bg-white/60 p-10 flex flex-col items-center text-center gap-3">
      <div className="w-11 h-11 rounded-full bg-(--color-surface) flex items-center justify-center">
        <Icon className="w-5 h-5 text-(--color-mist)" />
      </div>
      <p className="font-medium text-[14px] m-0">{title}</p>
      <p className="text-[13px] text-(--color-mist) m-0 max-w-[42ch]">{body}</p>
    </section>
  );
}
