import { Reveal } from '../components/Reveal';
import { verifyCommand, workflows } from '../lib/facts';

export function VerifyCta() {
  return (
    <section id="verify" className="bg-(--color-accent) text-white">
      <div className="max-w-[1200px] mx-auto px-6 sm:px-10 py-24">
        <Reveal>
          <h3 className="font-extrabold text-[clamp(32px,4.4vw,58px)] leading-[1.06] tracking-tight max-w-[16ch] m-0">
            Don't take our word for it.
          </h3>
          <p className="text-lg leading-relaxed max-w-[56ch] mt-6 opacity-90">
            Anyone can run the verifier — no login, no access to Ashlar's systems. It re-fetches
            the real blockchain history and re-derives every proof from scratch.
          </p>

          <div className="mt-9 inline-flex items-center gap-3 rounded-xl bg-black/20 backdrop-blur px-5 py-3 font-mono text-sm">
            <span className="opacity-60 select-none">$</span>
            {verifyCommand}
          </div>

          <div className="flex gap-4 flex-wrap mt-8">
            <a
              href={workflows.oneTimeApproval.explorer}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center rounded-full border border-white/70 font-semibold text-[15px] px-6 py-3 transition-transform hover:-translate-y-0.5 hover:bg-white/10"
            >
              Read the on-chain trail
            </a>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
