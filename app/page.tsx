import { JetBrains_Mono } from "next/font/google";
import { MotionHomepage } from "@/components/experience/motion-home/MotionHomepage";
import { getExperienceViewModel } from "@/components/experience/motion-home/data/homepageAdapters";

/**
 * Scoped to the homepage only — the rest of the app keeps its existing
 * Inter / Barlow Condensed / Bebas Neue system (see app/layout.tsx).
 * JetBrains Mono is used here for the data-readout/chapter-index
 * aesthetic the Motion Lab spec calls for.
 */
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export default async function HomePage() {
  const viewModel = await getExperienceViewModel();

  return (
    <div className={`${jetbrainsMono.variable} font-sans`}>
      <MotionHomepage viewModel={viewModel} />
    </div>
  );
}
