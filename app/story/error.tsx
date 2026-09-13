"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { ErrorMessage } from "@/components/ui/error-message";

type StoryErrorProps = {
  error: Error & {
    digest?: string;
  };
  reset: () => void;
};

export default function StoryError({
  error,
  reset,
}: StoryErrorProps) {
  useEffect(() => {
    console.error("Story page error:", error);
  }, [error]);

  return (
    <main className="mx-auto grid min-h-[70vh] max-w-xl place-content-center gap-4 px-4">
      <ErrorMessage
        title="This page couldn't load"
        message="Something went wrong. Please try again."
        details={process.env.NODE_ENV === "development" ? error.message : undefined}
      />

      <Button onClick={reset}>Try again</Button>
    </main>
  );
}
