import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { CircleAlert, ExternalLink, FileBadge } from 'lucide-react';
import { explorerAddress, RELAY_URL, type Receipt } from '../types.js';
import { EmptyState } from '../components/EmptyState.js';

function SkeletonReceipts() {
  return (
    <div className="grid sm:grid-cols-2 gap-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-(--color-hairline) bg-white p-4 flex flex-col gap-2.5">
          <div className="skeleton h-4 w-2/3 rounded" />
          <div className="skeleton h-3 w-1/3 rounded" />
        </div>
      ))}
    </div>
  );
}

export function Receipts() {
  const [receipts, setReceipts] = useState<Receipt[] | null>(null);
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setStatus('loading');
    fetch(`${RELAY_URL}/receipts`)
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json()).error ?? `relay returned ${res.status}`);
        return res.json() as Promise<{ receipts: Receipt[] }>;
      })
      .then((data) => {
        setReceipts(data.receipts);
        setStatus('loaded');
      })
      .catch((err: Error) => {
        setError(err.message);
        setStatus('error');
      });
  }, []);

  if (status === 'loading') return <SkeletonReceipts />;

  if (status === 'error') {
    return (
      <section className="rounded-xl border border-(--color-hairline) bg-white p-5">
        <p className="text-[13.5px] text-red-700 m-0 flex items-center gap-1.5">
          <CircleAlert className="w-4 h-4 shrink-0" /> {error}
        </p>
      </section>
    );
  }

  if (!receipts || receipts.length === 0) {
    return (
      <EmptyState
        icon={FileBadge}
        title="No receipts yet"
        body="A compressed NFT lands here the moment a workflow settles for real."
      />
    );
  }

  return (
    <div>
      <p className="text-[12.5px] text-(--color-mist) mb-3">
        {receipts.length} real compressed {receipts.length === 1 ? 'NFT' : 'NFTs'}, queried live
        from Helius's DAS index — not a local record.
      </p>
      <div className="grid sm:grid-cols-2 gap-3">
        {receipts.map((r, i) => (
          <motion.div
            key={r.assetId}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: Math.min(i, 8) * 0.04 }}
            className="rounded-xl border border-(--color-hairline) bg-white p-4 transition-shadow hover:shadow-md"
          >
            <div className="flex items-center gap-2 mb-2.5">
              <FileBadge className="w-4 h-4 text-(--color-accent) shrink-0" />
              <p className="font-medium text-[13.5px] m-0 truncate">{r.name}</p>
            </div>
            {r.workflowId && (
              <p className="text-[11px] text-(--color-mist) mb-1 m-0">
                workflow <span className="font-mono">{r.workflowId}</span>
              </p>
            )}
            <div className="flex gap-3 mt-2.5">
              <a
                href={explorerAddress(r.assetId)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[12px] font-medium text-(--color-accent) hover:text-(--color-accent-hover)"
              >
                Explorer <ExternalLink className="w-3 h-3" />
              </a>
              {r.jsonUri && (
                <a
                  href={r.jsonUri}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[12px] font-medium text-(--color-accent) hover:text-(--color-accent-hover)"
                >
                  Metadata <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
