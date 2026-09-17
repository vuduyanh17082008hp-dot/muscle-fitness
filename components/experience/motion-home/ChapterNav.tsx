"use client";

import { navChapters } from "@/components/experience/motion-home/motion/motionTokens";
import styles from "@/components/experience/motion-home/styles/motion-home.module.css";

/**
 * Desktop-only right-side chapter progress indicator. `activeChapter`
 * changes only on ScrollTrigger threshold crossings (see
 * useSceneDirector), so this re-renders rarely, not per scroll frame.
 */
export function ChapterNav({ activeChapter }: { activeChapter: string }) {
  return (
    <nav
      aria-label="Page chapters"
      className="fixed right-6 top-1/2 z-40 hidden -translate-y-1/2 flex-col items-end gap-3 lg:flex"
    >
      {navChapters.map((chapter) => {
        const isActive = chapter.id === activeChapter;

        return (
          <a
            key={chapter.id}
            href={`#${chapter.id}`}
            className="group flex items-center gap-2.5"
            aria-current={isActive ? "true" : undefined}
          >
            <span
              className={`${styles.monoLabel} text-[10px] font-bold uppercase tracking-[0.14em] transition-all duration-300 ${
                isActive ? "opacity-100" : "opacity-0 group-hover:opacity-60"
              }`}
              style={{ color: isActive ? "var(--mf-brand)" : "var(--mf-pub-text-muted)" }}
            >
              {chapter.label}
            </span>

            <span
              className="block h-px transition-all duration-300"
              style={{
                width: isActive ? "28px" : "12px",
                background: isActive ? "var(--mf-brand)" : "rgba(255,255,255,0.22)",
              }}
            />
          </a>
        );
      })}
    </nav>
  );
}
