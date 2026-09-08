/* =========================================================
   MEDIA TYPES
========================================================= */

export type VideoMediaConfig = {
  autoplay?: boolean;

  muted?: boolean;

  loop?: boolean;

  poster?: string;
};

/* =========================================================
   VIDEO PROPS
========================================================= */

export function getVideoProps(
  media: VideoMediaConfig,
) {
  return {
    autoPlay:
      media.autoplay ??
      true,

    muted:
      media.muted ??
      true,

    loop:
      media.loop ??
      true,

    playsInline:
      true,

    poster:
      media.poster,
  };
}