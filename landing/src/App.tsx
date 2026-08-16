import { useEffect, useState } from 'react';
import Lenis from 'lenis';
import { motion, useScroll } from 'motion/react';
import { Nav } from './sections/Nav';
import { Hero } from './sections/Hero';
import { Problem } from './sections/Problem';
import { ArchitectureStack } from './sections/ArchitectureStack';
import { HowItWorks } from './sections/HowItWorks';
import { ProofStats } from './sections/ProofStats';
import { CaseStudy } from './sections/CaseStudy';
import { VerifyCta } from './sections/VerifyCta';
import { Footer } from './sections/Footer';

function useSmoothScroll() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const lenis = new Lenis();
    let frame: number;
    const raf = (time: number) => {
      lenis.raf(time);
      frame = requestAnimationFrame(raf);
    };
    frame = requestAnimationFrame(raf);
    return () => {
      cancelAnimationFrame(frame);
      lenis.destroy();
    };
  }, []);
}

export default function App() {
  useSmoothScroll();
  const { scrollYProgress } = useScroll();
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  return (
    <div className="relative">
      <motion.div
        className="fixed top-0 left-0 h-[3px] bg-(--color-accent) z-[60] origin-left"
        style={{ scaleX: scrollYProgress, width: '100%' }}
      />
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: ready ? 1 : 0 }}
        transition={{ duration: 0.4 }}
      >
        <Nav />
        <Hero />
        <hr className="h-0.5 border-0 bg-(--color-hairline)" />
        <Problem />
        <hr className="h-0.5 border-0 bg-(--color-hairline)" />
        <ArchitectureStack />
        <HowItWorks />
        <ProofStats />
        <hr className="h-0.5 border-0 bg-(--color-hairline)" />
        <CaseStudy />
        <VerifyCta />
        <Footer />
      </motion.div>
    </div>
  );
}
