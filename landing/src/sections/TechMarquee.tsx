import { techStack } from '../lib/facts';

export function TechMarquee() {
  const doubled = [...techStack, ...techStack];
  return (
    <div className="border-y border-(--color-hairline) bg-(--color-surface)/60 overflow-hidden py-4">
      <p className="sr-only">Real integrations: {techStack.join(', ')}</p>
      <div className="flex w-max animate-marquee" aria-hidden>
        {doubled.map((name, i) => (
          <span
            key={`${name}-${i}`}
            className="text-sm font-semibold tracking-wide text-(--color-mist) px-8 whitespace-nowrap"
          >
            {name}
          </span>
        ))}
      </div>
    </div>
  );
}
