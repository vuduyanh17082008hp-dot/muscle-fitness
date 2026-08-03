"use client";
import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

const TrainingPreview = () => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });
  return (
    <section ref={ref} className="py-24 bg-charcoal">
      <div className="max-w-6xl mx-auto px-6 grid md:grid-cols-2 gap-12 items-center">
        <motion.div
          initial={{ opacity: 0, x: -30 }}
          animate={isInView ? { opacity: 1, x: 0 } : {}}
          transition={{ duration: 0.8 }}
        >
          <p className="text-gold/80 font-semibold tracking-[0.2em] text-sm mb-4">TRAINING COURSE</p>
          <h2 className="text-3xl md:text-4xl font-display font-bold text-white mb-6">
            Your Personal Roadmap to Strength
          </h2>
          <p className="text-gray-300 mb-6">
            Structured programs, video guides, and progressive overload principles – everything you need to build muscle and confidence.
          </p>
          <Link
            href="/training"
            className="inline-flex items-center gap-2 text-gold font-semibold hover:underline"
          >
            EXPLORE COURSES <ArrowRight className="w-4 h-4" />
          </Link>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={isInView ? { opacity: 1, scale: 1 } : {}}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="bg-black/40 rounded-lg p-4 border border-white/5"
        >
          <img
            src="/images/training-preview.jpg" // Replace with real image
            alt="Training preview"
            className="rounded w-full"
          />
        </motion.div>
      </div>
    </section>
  );
};

export default TrainingPreview;