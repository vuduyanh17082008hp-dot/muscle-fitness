"use client";

import { useEffect, useRef } from "react";
import { motion, useScroll, useTransform, useMotionValue, useSpring } from "framer-motion";
import { useReducedMotion } from "@/lib/useReducedMotion";
import { ArrowRight, ChevronDown } from "lucide-react";
import Link from "next/link";

const Hero = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollY } = useScroll();
  const reduced = useReducedMotion();

  // Parallax for background
  const bgY = useTransform(scrollY, [0, 500], [0, 100]);

  // Mouse parallax for subtle movement (desktop only)
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const springX = useSpring(mouseX, { stiffness: 50, damping: 20 });
  const springY = useSpring(mouseY, { stiffness: 50, damping: 20 });

  useEffect(() => {
    if (reduced) return;
    const handleMouseMove = (e: MouseEvent) => {
      const { innerWidth, innerHeight } = window;
      const x = (e.clientX / innerWidth - 0.5) * 10;
      const y = (e.clientY / innerHeight - 0.5) * 10;
      mouseX.set(x);
      mouseY.set(y);
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [reduced, mouseX, mouseY]);

  return (
    <section
      ref={containerRef}
      className="relative h-screen min-h-[650px] overflow-hidden flex items-center justify-center"
    >
      {/* Background image (replace with your own) */}
      <motion.div
        className="absolute inset-0 z-0"
        style={{ y: reduced ? 0 : bgY }}
      >
        <img
          src="/images/hero-gym.jpg"  // Replace with your actual hero image
          alt=""
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-black/90" />
        <div className="absolute inset-0 bg-[url('/story/textures/grain.png')] opacity-10 mix-blend-overlay" />
      </motion.div>

      {/* Subtle mouse‑driven layer */}
      {!reduced && (
        <motion.div
          className="absolute inset-0 z-10 pointer-events-none"
          style={{ x: springX, y: springY }}
        >
          <div className="absolute top-1/4 left-10 w-64 h-64 bg-gold/5 rounded-full blur-3xl" />
          <div className="absolute bottom-1/3 right-10 w-96 h-96 bg-crimson/5 rounded-full blur-3xl" />
        </motion.div>
      )}

      {/* Content */}
      <div className="relative z-20 max-w-4xl mx-auto text-center px-6">
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.8 }}
          className="text-gold/80 font-semibold tracking-[0.3em] text-sm mb-4"
        >
          BUILT THROUGH DISCIPLINE
        </motion.p>

        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.8 }}
          className="text-5xl md:text-7xl lg:text-8xl font-display font-bold text-white leading-tight"
        >
          BUILD THE BODY.
          <br />
          FORGE THE MIND.
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8, duration: 0.8 }}
          className="mt-6 max-w-xl mx-auto text-lg text-gray-300"
        >
          Training, nutrition and coaching built around one goal: becoming stronger than the person you were yesterday.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.1, duration: 0.8 }}
          className="mt-10 flex flex-col sm:flex-row gap-4 justify-center"
        >
          <Link
            href="/signup"
            className="px-8 py-3 bg-gold text-black font-bold rounded hover:bg-gold/90 transition flex items-center justify-center gap-2"
          >
            START FREE
            <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            href="/training"
            className="px-8 py-3 border border-white/20 text-white rounded hover:bg-white/10 transition"
          >
            EXPLORE TRAINING
          </Link>
        </motion.div>

        {/* Small story teaser */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5, duration: 1 }}
          className="mt-8"
        >
          <Link href="/story" className="text-gold/70 text-sm hover:text-gold transition inline-flex items-center gap-1">
            READ MY STORY <ArrowRight className="w-3 h-3" />
          </Link>
        </motion.p>
      </div>

      {/* Scroll indicator */}
      <motion.div
        animate={{ y: [0, 8, 0] }}
        transition={{ repeat: Infinity, duration: 2 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 text-white/40"
      >
        <ChevronDown className="w-6 h-6" />
      </motion.div>
    </section>
  );
};

export default Hero;