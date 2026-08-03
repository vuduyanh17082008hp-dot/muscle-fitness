// components/story/StoryVisual.tsx

"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { ImageIcon } from "lucide-react";
import { useReducedMotion } from "framer-motion";

import type { StoryMedia, StoryTheme } from "@/data/storyContent";

type StoryVisualProps = {
  media: StoryMedia;
  theme: StoryTheme;
  chapterNumber: string;
};

const fallbackStyles: Record<StoryTheme, string> = {
  dark: "from-zinc-950 via-zinc-900 to-black",
  crimson: "from-red-950 via-zinc-950 to-black",
  steel: "from-slate-700 via-zinc-900 to-black",
  gold: "from-amber-900 via-zinc-900 to-black",
};

export default function StoryVisual({
  media,
  theme,
  chapterNumber,
}: StoryVisualProps) {
  const [failed, setFailed] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    setFailed(false);
  }, [media.src]);

  useEffect(() => {
    const video = videoRef.current;

    if (
      !video ||
      media.type !== "video" ||
      !media.autoplay ||
      shouldReduceMotion
    ) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          video.play().catch(() => {
            // Autoplay can be blocked by the browser.
          });
        } else {
          video.pause();
        }
      },
      {
        threshold: 0.35,
      },
    );

    observer.observe(video);

    return () => {
      observer.disconnect();
      video.pause();
    };
  }, [media.autoplay, media.type, shouldReduceMotion]);

  const fallback = (
    <div
      className={`absolute inset-0 flex items-center justify-center bg-gradient-to-br ${fallbackStyles[theme]}`}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.12),transparent_58%)]" />

      <div className="relative flex flex-col items-center gap-4 px-8 text-center">
        <div className="flex size-16 items-center justify-center rounded-full border border-white/15 bg-black/30 backdrop-blur-md">
          <ImageIcon aria-hidden="true" className="size-6 text-white/60" />
        </div>

        <span className="text-xs font-bold tracking-[0.4em] text-white/45">
          CHAPTER {chapterNumber}
        </span>

        <p className="max-w-xs text-sm leading-6 text-white/50">
          Add your visual to
          <br />
          <code className="break-all text-white/70">{media.src}</code>
        </p>
      </div>
    </div>
  );

  return (
    <figure className="group">
      <div className="relative aspect-[4/5] overflow-hidden rounded-[1.75rem] border border-white/10 bg-zinc-950 shadow-2xl shadow-black/60 sm:aspect-[16/13] lg:aspect-[4/5]">
        {failed ? (
          fallback
        ) : media.type === "video" ? (
          <video
            ref={videoRef}
            className="absolute inset-0 size-full object-cover"
            src={media.src}
            poster={media.poster}
            muted
            playsInline
            loop={media.loop}
            controls={media.controls}
            preload="metadata"
            onError={() => setFailed(true)}
            style={{
              objectPosition: media.objectPosition ?? "center",
            }}
          />
        ) : (
          <Image
            src={media.src}
            alt={media.alt}
            fill
            sizes="(max-width: 1024px) 100vw, 50vw"
            className="object-cover grayscale transition duration-1000 ease-out group-hover:scale-[1.025] group-hover:grayscale-0"
            style={{
              objectPosition: media.objectPosition ?? "center",
            }}
            onError={() => setFailed(true)}
          />
        )}

        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/10" />

        <div className="pointer-events-none absolute left-5 top-5 rounded-full border border-white/15 bg-black/45 px-4 py-2 text-xs font-bold tracking-[0.25em] text-white/75 backdrop-blur-md">
          {chapterNumber}
        </div>
      </div>

      {media.caption && (
        <figcaption className="mt-4 text-sm leading-6 text-zinc-500">
          {media.caption}
        </figcaption>
      )}
    </figure>
  );
}