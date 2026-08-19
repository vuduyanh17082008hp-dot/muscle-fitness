export const getVideoProps = (media: {
  autoplay?: boolean;
  muted?: boolean;
  loop?: boolean;
  poster?: string;
}) => ({
  autoPlay: media.autoplay ?? true,
  muted: media.muted ?? true,
  loop: media.loop ?? true,
  playsInline: true,
  poster: media.poster,
});