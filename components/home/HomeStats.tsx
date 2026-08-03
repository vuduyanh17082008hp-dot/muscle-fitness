"use client";
import { motion, useInView } from "framer-motion";
import { useRef } from "react";

const stats = [
  { value: 8, suffix: " Months", label: "Transformation" },
  { value: 68, suffix: " KG", label: "From 88kg" },
  { value: 500, suffix: "+", label: "Trained Clients" },
  { value: 4, suffix: " Principles", label: "4D Method" },
];

const HomeStats = () => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true });
  return (
    <section ref={ref} className="py-20 bg-black">
      <div className="max-w-5xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
        {stats.map((stat, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: i * 0.1, duration: 0.6 }}
          >
            <span className="text-4xl font-bold text-white">
              {stat.value}
              <span className="text-gold">{stat.suffix}</span>
            </span>
            <p className="text-gray-400 mt-2 text-sm uppercase tracking-wide">{stat.label}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
};

export default HomeStats;