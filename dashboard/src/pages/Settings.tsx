import { useEffect, useState } from 'react';
import { RELAY_URL, LANDING_URL } from '../types.js';

export function Settings() {
  const [info, setInfo] = useState<{ programId: string; network: string } | null>(null);

  useEffect(() => {
    fetch(`${RELAY_URL}/info`)
      .then((res) => res.json() as Promise<{ programId: string; network: string }>)
      .then(setInfo)
      .catch(() => setInfo(null));
  }, []);

  const rows = [
    { label: 'Relay URL', value: RELAY_URL },
    { label: 'Landing page URL', value: LANDING_URL },
    { label: 'Program ID', value: info?.programId ?? 'loading…' },
    { label: 'Network', value: info?.network ?? 'loading…' },
  ];

  return (
    <div className="rounded-xl border border-(--color-hairline) bg-white p-5">
      <p className="text-[13px] text-(--color-mist) mb-4">
        Connection info only — real values this frontend is actually configured with. The RPC
        endpoint itself is deliberately never shown here: it embeds a Helius API key, and the
        whole point of the relay is that the browser never sees that key.
      </p>
      <div className="flex flex-col gap-2.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-4 py-2 border-b border-(--color-hairline) last:border-0">
            <span className="text-[12.5px] text-(--color-mist)">{r.label}</span>
            <span className="font-mono text-[12.5px] text-right break-all">{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
