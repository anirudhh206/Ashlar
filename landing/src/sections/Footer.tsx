const tags = ['Solana', 'Squads', 'x402', 'AP2', 'Pyth'];

export function Footer() {
  return (
    <footer className="max-w-[1200px] mx-auto px-6 sm:px-10 py-12 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-t border-(--color-hairline)">
      <div className="flex gap-2 flex-wrap">
        {tags.map((t) => (
          <span
            key={t}
            className="text-xs border border-(--color-accent)/40 text-(--color-accent) rounded-full px-3 py-1"
          >
            {t}
          </span>
        ))}
      </div>
      <p className="text-[13px] text-(--color-mist) m-0">
        Ashlar — compiled once. Verified always. Runs today on Solana devnet.
      </p>
    </footer>
  );
}
