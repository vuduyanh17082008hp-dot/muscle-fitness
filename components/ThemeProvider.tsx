"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

// Instead of looking for a deep export path, we instruct TypeScript 
// to grab the props directly from the NextThemesProvider component.
type ThemeProviderProps = React.ComponentPropsWithoutRef<typeof NextThemesProvider>;

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}