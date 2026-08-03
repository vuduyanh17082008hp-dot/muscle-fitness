"use client";
import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

const KeepReading = ({ children }: { children: React.ReactNode }) => {
  const [expanded, setExpanded] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);

  const handleExpand = () => {
    setExpanded(true);
    setTimeout(() => {
      triggerRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  };

  return (
    <>
      {!expanded && (
        <div className="flex justify-center py-24 bg-black">
          <button
            onClick={handleExpand}
            className="px-10 py-4 bg-gold/10 border border-gold/30 text-gold font-bold rounded-full hover:bg-gold/20 transition text-lg"
            aria-expanded={expanded}
          >
            Read My Journey
          </button>
        </div>
      )}
      <AnimatePresence>
        {expanded && (
          <motion.div
            key="story"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8 }}
          >
            <div ref={triggerRef} id="keep-reading" />
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default KeepReading;