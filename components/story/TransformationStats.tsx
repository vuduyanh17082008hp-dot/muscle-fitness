"use client";
import { useEffect, useRef, useState } from "react";
import { useInView } from "framer-motion";
import storyData from "@/data/storyContent";

const TransformationStats = () => {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true });
  const [counts, setCounts] = useState(storyData.stats.map(() => 0));

  useEffect(() => {
    if (!isInView) return;
    const intervals = storyData.stats.map((stat, i) => {
      const step = Math.ceil(stat.value / 30);
      const timer = setInterval(() => {
        setCounts((prev) => {
          const newCounts = [...prev];
          if (newCounts[i] < stat.value) {
            newCounts[i] = Math.min(stat.value, newCounts[i] + step);
          }
          return newCounts;
        });
      }, 30);
      return timer;
    });
    return () => intervals.forEach(clearInterval);
  }, [isInView]);

  return (
    <section ref={ref} className="py-24 bg-charcoal">
      <div className="max-w-5xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
        {storyData.stats.map((stat, i) => (
          <div key={i}>
            <div className="text-5xl font-bold text-white">
              {counts[i]}
              <span className="text-gold">{stat.suffix}</span>
            </div>
            <p className="text-gray-400 mt-2">{stat.label}</p>
          </div>
        ))}
      </div>
      <p className="text-center text-gray-500 italic mt-10 max-w-md mx-auto">
        “The scale measured what I lost. It could never measure everything I gained.”
      </p>
    </section>
  );
};

export default TransformationStats;