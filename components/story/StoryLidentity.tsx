"use client";
import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import storyData from "@/data/storyContent";

const StoryIdentity = () => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });
  const { identity } = storyData;

  return (
    <section ref={ref} className="py-24 px-6 bg-black">
      <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-12 items-center">
        {/* Image with cinematic reveal */}
        <motion.div
          initial={{ filter: "grayscale(100%) blur(8px)", scale: 1.1, opacity: 0 }}
          animate={
            isInView
              ? { filter: "grayscale(0%) blur(0px)", scale: 1, opacity: 1 }
              : {}
          }
          transition={{ duration: 1.5, ease: "easeOut" }}
          className="relative aspect-[3/4] overflow-hidden rounded-lg"
        >
          <img
            src={identity.media.src}
            alt={identity.media.alt}
            className="w-full h-full object-cover"
            style={{ objectPosition: identity.media.objectPosition }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
        </motion.div>

        <div className="text-white">
          <motion.p
            initial={{ opacity: 0, x: -20 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ delay: 0.4, duration: 0.8 }}
            className="text-crimson font-semibold tracking-[0.2em] text-sm mb-4"
          >
            BEFORE EVERYTHING CHANGED
          </motion.p>
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 0.5, duration: 0.8 }}
            className="text-4xl md:text-5xl font-display font-bold mb-6"
          >
            {identity.title}
          </motion.h2>
          <motion.blockquote
            initial={{ opacity: 0 }}
            animate={isInView ? { opacity: 1 } : {}}
            transition={{ delay: 0.7, duration: 1 }}
            className="border-l-4 border-gold pl-6 italic text-gray-300 text-xl"
          >
            “{identity.quote.text}”
          </motion.blockquote>
        </div>
      </div>
    </section>
  );
};

export default StoryIdentity;