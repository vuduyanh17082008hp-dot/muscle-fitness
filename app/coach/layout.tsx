import type { ReactNode } from "react";

type CoachLayoutProps = {
  children: ReactNode;
};

/** Pass-through — `/coach` immediately redirects to `/dashboard/ai-coach`. */
export default function CoachLayout({ children }: CoachLayoutProps) {
  return children;
}
