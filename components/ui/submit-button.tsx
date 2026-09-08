"use client";

import type {
  ReactNode,
} from "react";

import {
  useFormStatus,
} from "react-dom";

import {
  Button,
  type ButtonProps,
} from "@/components/ui/button";

/* =========================================================
   TYPES
========================================================= */

type SubmitButtonProps =
  Omit<
    ButtonProps,
    | "type"
    | "loading"
    | "loadingText"
  > & {
    pendingText?: string;

    children:
      ReactNode;
  };

/* =========================================================
   SUBMIT BUTTON
========================================================= */

export function SubmitButton({
  pendingText =
    "Submitting...",

  children,

  disabled,

  ...props
}: SubmitButtonProps) {
  const {
    pending,
  } =
    useFormStatus();

  return (
    <Button
      {...props}
      type="submit"
      disabled={
        Boolean(disabled) ||
        pending
      }
      loading={
        pending
      }
      loadingText={
        pendingText
      }
    >
      {children}
    </Button>
  );
}