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
  // Cast to a concrete element type for the JSX call below. With a
  // generic `T` param, TypeScript's LibraryManagedAttributes
  // resolution can fail once the global JSX.IntrinsicElements surface
  // grows large (e.g. after adding @react-three/fiber, which
  // augments it with every three.js element) — this is a type-level
  // workaround only, `Component`'s actual runtime value/props are
  // unchanged.
  const Component = (as ?? "div") as "div";

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