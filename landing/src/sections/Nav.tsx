const links = [
  { href: '#how', label: 'How it works' },
  { href: '#proof', label: 'Proof' },
  { href: '#case', label: 'Settlement' },
  { href: '#verify', label: 'Verify' },
];

export function Nav() {
  return (
    <nav className="sticky top-0 z-50 flex items-center gap-8 px-6 sm:px-10 py-4 bg-white/75 backdrop-blur-xl border-b border-(--color-hairline)">
      <span className="font-extrabold tracking-tight text-lg mr-auto">ASHLAR</span>
      {links.map((l) => (
        <a
          key={l.href}
          href={l.href}
          className="hidden sm:inline text-sm text-(--color-ink)/80 hover:text-(--color-accent) transition-colors"
        >
          {l.label}
        </a>
      ))}
      <a
        href="#verify"
        className="inline-flex items-center rounded-full bg-(--color-accent) text-white text-sm font-semibold px-4 py-2 transition-transform hover:-translate-y-0.5 hover:bg-(--color-accent-hover)"
      >
        Run the verifier
      </a>
    </nav>
  );
}
