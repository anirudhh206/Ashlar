import { useState, type MouseEvent } from 'react';
import { Check, Copy } from 'lucide-react';

export function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  }

  return (
    <button
      onClick={handleCopy}
      className="text-(--color-mist) hover:text-(--color-accent) transition-colors shrink-0"
      title="Copy"
    >
      {copied ? <Check className="w-3 h-3 text-(--color-accent)" /> : <Copy className="w-3 h-3" />}
    </button>
  );
}
