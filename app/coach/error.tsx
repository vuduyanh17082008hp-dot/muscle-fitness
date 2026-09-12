"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { ErrorMessage } from "@/components/ui/error-message";

type CoachErrorProps = {
  error: Error & {
    digest?: string;
  };
  reset: () => void;
};

export default function CoachError({
  error,
  reset,
}: CoachErrorProps) {
  useEffect(() => {
    console.error("Dante error:", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-xl space-y-4 py-12">
      <ErrorMessage
        title="Dante đang gián đoạn"
        message="Không thể khởi tạo phiên tư vấn. Vui lòng thử lại."
      />

      <Button onClick={reset}>
        Kết nối lại
      </Button>
    </div>
  );
}