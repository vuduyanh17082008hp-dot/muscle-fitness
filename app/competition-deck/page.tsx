import React from "react";
import { Metadata } from "next";
import { CompetitionDeck } from "@/components/competition-deck/CompetitionDeck";

export const metadata: Metadata = {
  title: "Muscle Fitness — Competition Pitch Deck",
  description: "AI Fitness Intelligence — Premium Interactive Presentation",
};

type PageProps = {
  searchParams: Promise<{ print?: string; export?: string; notext?: string }>;
};

export default async function CompetitionDeckPage({ searchParams }: PageProps) {
  const params = await searchParams;
  return (
    <CompetitionDeck
      isPrintMode={params.print === "1" || params.export === "1"}
      isNoTextMode={params.notext === "1"}
    />
  );
}
