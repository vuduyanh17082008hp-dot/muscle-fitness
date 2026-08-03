import type {
  HTMLAttributes,
  ReactNode,
} from "react";

import { cn } from "@/lib/cn";
import { PageContainer } from "./page-container";

type SectionWrapperProps =
  HTMLAttributes<HTMLElement> & {
    children: ReactNode;
    containerClassName?: string;
    noContainer?: boolean;
  };

export function SectionWrapper({
  children,
  className,
  containerClassName,
  noContainer = false,
  ...props
}: SectionWrapperProps) {
  return (
    <section
      className={cn(
        `
          relative py-16
          sm:py-20 lg:py-28
        `,
        className,
      )}
      {...props}
    >
      {noContainer ? (
        children
      ) : (
        <PageContainer className={containerClassName}>
          {children}
        </PageContainer>
      )}
    </section>
  );
}