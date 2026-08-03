"use client";
import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import storyData from "@/data/storyContent";

const StoryTimeline = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start end", "end start"],
  });

  const lineHeight = useTransform(scrollYProgress, [0, 1], ["0%", "100%"]);

  return (
    <section
      ref={containerRef}
      className="relative py-24 bg-charcoal overflow-hidden"
    >
      <div className="max-w-4xl mx-auto px-6">
        <h2 className="text-4xl md:text-5xl font-display font-bold text-white text-center mb-20">
          Eight Months of Becoming
        </h2>
        <div className="relative">
          {/* Vertical line */}
          <motion.div
            className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-gold/20 origin-top"
            style={{ scaleY: lineHeight }}
          />
          {storyData.timeline.milestones.map((milestone, idx) => (
            <TimelineItem key={idx} milestone={milestone} index={idx} />
          ))}
        </div>
      </div>
      <p className="text-center text-gray-500 italic mt-16 max-w-xl mx-auto">
        “Every workout was a vote for the person I wanted to become.”
      </p>
    </section>
  );
};

const TimelineItem = ({
  milestone,
  index,
}: {
  milestone: any;
  index: number;
}) => {
  const itemRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: itemRef,
    offset: ["start end", "center center"],
  });
  const opacity = useTransform(scrollYProgress, [0, 0.5, 1], [0, 1, 1]);
  const y = useTransform(scrollYProgress, [0, 0.5, 1], [30, 0, 0]);

  return (
    <motion.div
      ref={itemRef}
      style={{ opacity, y }}
      className={`flex items-center w-full mb-20 ${
        index % 2 === 0 ? "flex-row" : "flex-row-reverse"
      }`}
    >
      <div className="w-1/2 px-4">
        <div className="bg-black/60 backdrop-blur p-6 rounded border border-white/5">
          <span className="text-gold text-sm font-semibold">
            {milestone.month}
          </span>
          <h3 className="text-xl font-bold text-white mt-1">
            {milestone.title}
          </h3>
          <p className="text-gray-300 mt-2">{milestone.shortStory}</p>
          {milestone.quote && (
            <p className="text-sm italic text-gold/70 mt-2">
              “{milestone.quote.text}”
            </p>
          )}
          {milestone.stat && (
            <div className="mt-3 text-gold font-bold">
              {milestone.stat.value}
              {milestone.stat.suffix}{" "}
              <span className="text-xs text-gray-400">
                {milestone.stat.label}
              </span>
            </div>
          )}
        </div>
      </div>
      <div className="w-1/2 px-4">
        {milestone.image && (
          <img
            src={milestone.image}
            alt={milestone.title}
            className="rounded w-full h-48 object-cover"
          />
        )}
        {milestone.video && (
          <video
            autoPlay
            muted
            loop
            playsInline
            poster={milestone.poster}
            className="rounded w-full h-48 object-cover"
          >
            <source src={milestone.video} type="video/mp4" />
          </video>
        )}
      </div>
    </motion.div>
  );
};

export default StoryTimeline;