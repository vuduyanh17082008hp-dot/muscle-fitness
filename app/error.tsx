"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { ErrorMessage } from "@/components/ui/error-message";

type RootErrorProps = {
  error: Error & {
    digest?: string;
  };
  reset: () => void;
};

export default function RootError({
  error,
  reset,
}: RootErrorProps) {
  useEffect(() => {
    console.error("Application route error:", error);
  }, [error]);

  return (
    <main
      className={[
        "mx-auto grid min-h-[70vh] max-w-xl",
        "place-content-center gap-4 px-4",
      ].join(" ")}
    >
      <ErrorMessage
        title="Trang chưa thể hiển thị"
        message="Đã có lỗi không mong muốn xảy ra."
      />

      <Button onClick={reset}>
        Thử tải lại
      </Button>
    </main>
  );
}