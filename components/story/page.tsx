// app/story/page.tsx

import type { Metadata } from "next";

import StoryPageClient from "@/components/story/StoryPageClient";

export const metadata: Metadata = {
  title: "My Story",
  description:
    "The story of my transformation from 88 kilograms to 68 kilograms and the purpose behind Muscle Fitness.",
};

export default function StoryPage() {
  return <StoryPageClient />;
}