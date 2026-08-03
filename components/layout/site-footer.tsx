import { PageContainer } from "@/components/layout/page-container";
import { siteConfig } from "@/config/site";

export function SiteFooter() {
  return (
    <footer className="border-t border-border py-8">
      <PageContainer
        className={[
          "flex flex-col gap-2 text-sm text-muted-foreground",
          "sm:flex-row sm:items-center sm:justify-between",
        ].join(" ")}
      >
        <p>
          © {new Date().getFullYear()} {siteConfig.name}.
        </p>

        <p>Luyện tập thông minh. Tiến bộ bền vững.</p>
      </PageContainer>
    </footer>
  );
}