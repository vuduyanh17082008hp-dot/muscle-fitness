"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

import {
  Button,
  type ButtonProps,
} from "@/components/ui/button";

type SubmitButtonProps = Omit<
  ButtonProps,
  "type" | "loading"
> & {
  pendingText?: string;
  children: ReactNode;
};

export function SubmitButton({
  pendingText = "Submitting...",
  children,
  disabled,
  ...props
}: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <Button
      {...props}
      type="submit"
      disabled={disabled || pending}
      loading={pending}
      loadingText={pendingText}
    >
      {children}
    </Button>
  );
}