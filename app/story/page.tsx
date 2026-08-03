import type { Metadata } from "next";

import StoryPageClient from "@/components/story/StoryPageClient";

export const metadata: Metadata = {
  title: "My Story | Muscle Fitness",
  description:
    "The story of rebuilding my body, confidence and purpose—from 88 kilograms to 68 kilograms.",
};

export default function StoryPage() {
  return <StoryPageClient />;
}