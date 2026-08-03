import type {
  ComponentPropsWithoutRef,
  ElementType,
} from "react";

import { cn } from "@/lib/cn";

type PageContainerProps<T extends ElementType = "div"> = {
  as?: T;
} & ComponentPropsWithoutRef<T>;

export function PageContainer<
  T extends ElementType = "div",
>({
  as,
  className,
  ...props
}: PageContainerProps<T>) {
  const Component = as ?? "div";

  return (
    <Component
      className={cn(
        `
          mx-auto w-full
          max-w-[var(--container-width)]
          px-4 sm:px-6 lg:px-8
        `,
        className,
      )}
      {...props}
    />
  );
}