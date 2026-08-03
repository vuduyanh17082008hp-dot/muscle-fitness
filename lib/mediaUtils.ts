export const getVideoProps = (media: any) => ({
  autoPlay: media.autoplay ?? true,
  muted: media.muted ?? true,
  loop: media.loop ?? true,
  playsInline: true,
  poster: media.poster,
});