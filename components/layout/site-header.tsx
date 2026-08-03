import Link from "next/link";

import { PageContainer } from "@/components/layout/page-container";
import { siteConfig } from "@/config/site";

export function SiteHeader() {
  return (
    <header
      className={[
        "sticky top-0 z-40",
        "border-b border-border",
        "bg-background/90 backdrop-blur",
      ].join(" ")}
    >
      <PageContainer className="flex h-16 items-center justify-between">
        <Link
          href="/"
          className="font-bold tracking-tight"
        >
          {siteConfig.name}
        </Link>

        <nav
          className="flex items-center gap-5"
          aria-label="Điều hướng chính"
        >
          {siteConfig.navigation.marketing.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={[
                "hidden text-sm",
                "text-muted-foreground",
                "transition-colors",
                "hover:text-foreground",
                "sm:inline-flex",
              ].join(" ")}
            >
              {item.title}
            </Link>
          ))}

          <Link
            href="/login"
            className={[
              "rounded-lg",
              "bg-primary px-4 py-2",
              "text-sm font-medium",
              "text-primary-foreground",
              "transition-opacity",
              "hover:opacity-90",
            ].join(" ")}
          >
            Đăng nhập
          </Link>
        </nav>
      </PageContainer>
    </header>
  );
}