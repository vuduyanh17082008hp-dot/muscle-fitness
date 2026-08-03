import type { Metadata } from "next";

import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "AI Coach",
};

export default function CoachPage() {
  return (
    <section className="space-y-6">
      <div>
        <p className="text-sm font-medium text-primary">
          AI COACH
        </p>

        <h1 className="mt-1 text-3xl font-bold tracking-tight">
          Huấn luyện viên cá nhân
        </h1>

        <p className="mt-2 text-muted-foreground">
          Khu vực tư vấn luyện tập và dinh dưỡng dựa trên mục
          tiêu của người dùng.
        </p>
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">
            Chưa có cuộc trò chuyện
          </h2>
        </CardHeader>

        <CardContent>
          <p className="text-sm text-muted-foreground">
            Kết nối feature{" "}
            <code className="rounded bg-muted px-1.5 py-0.5">
              ai-coach
            </code>{" "}
            vào trang này sau khi API hoàn thiện.
          </p>
        </CardContent>
      </Card>
    </section>
  );
}