import Link from "next/link";

export default function NotFound() {
  return (
    <main
      className={[
        "mx-auto grid min-h-[70vh] max-w-2xl",
        "place-content-center px-4 text-center",
      ].join(" ")}
    >
      <p className="text-sm font-semibold text-primary">
        404
      </p>

      <h1 className="mt-2 text-4xl font-bold tracking-tight">
        Không tìm thấy trang
      </h1>

      <p className="mt-4 text-muted-foreground">
        Đường dẫn có thể đã thay đổi hoặc nội dung không còn
        tồn tại.
      </p>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link
          href="/"
          className={[
            "rounded-lg bg-primary px-4 py-2",
            "text-sm font-medium text-primary-foreground",
          ].join(" ")}
        >
          Về trang chủ
        </Link>

        <Link
          href="/dashboard"
          className={[
            "rounded-lg bg-secondary px-4 py-2",
            "text-sm font-medium text-secondary-foreground",
          ].join(" ")}
        >
          Mở dashboard
        </Link>
      </div>
    </main>
  );
}