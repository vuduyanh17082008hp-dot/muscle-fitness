"use client";

import { useEffect } from "react";

type GlobalErrorProps = {
  error: Error & {
    digest?: string;
  };
  reset: () => void;
};

export default function GlobalError({
  error,
  reset,
}: GlobalErrorProps) {
  useEffect(() => {
    console.error("Global application error:", error);
  }, [error]);

  return (
    <html lang="vi">
      <body>
        <main
          style={{
            minHeight: "100vh",
            display: "grid",
            placeItems: "center",
            padding: "24px",
            fontFamily: "system-ui, sans-serif",
            background: "#ffffff",
            color: "#17211b",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 560,
              textAlign: "center",
            }}
          >
            <p
              style={{
                color: "#16a34a",
                fontWeight: 700,
              }}
            >
              MuscleFitness
            </p>

            <h1>
              Ứng dụng đang gặp sự cố
            </h1>

            <p>
              Vui lòng thử tải lại. Nếu lỗi tiếp tục xảy ra,
              hãy kiểm tra log phía server.
            </p>

            <button
              type="button"
              onClick={reset}
              style={{
                marginTop: 12,
                border: 0,
                borderRadius: 8,
                padding: "10px 16px",
                cursor: "pointer",
                background: "#16a34a",
                color: "#ffffff",
                fontWeight: 600,
              }}
            >
              Tải lại ứng dụng
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}