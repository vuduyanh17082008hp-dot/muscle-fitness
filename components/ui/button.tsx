import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import {
  cva,
  type VariantProps,
} from "class-variance-authority";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

/* =========================================================
   BUTTON VARIANTS
========================================================= */

const buttonVariants = cva(
  [
    "inline-flex",
    "items-center",
    "justify-center",
    "gap-2",
    "whitespace-nowrap",

    "rounded-lg",

    "text-sm",
    "font-semibold",

    "transition-all",
    "duration-200",

    "outline-none",

    "disabled:pointer-events-none",
    "disabled:cursor-not-allowed",
    "disabled:opacity-50",

    "focus-visible:ring-2",
    "focus-visible:ring-amber-500/50",
    "focus-visible:ring-offset-2",
    "focus-visible:ring-offset-black",

    "[&_svg]:pointer-events-none",
    "[&_svg]:shrink-0",
  ].join(" "),
  {
    variants: {
      /* ===================================================
         VARIANT
      =================================================== */

      variant: {
        default: [
          "bg-amber-500",
          "text-black",

          "hover:bg-amber-400",

          "active:translate-y-px",
        ].join(" "),

        primary: [
          "bg-amber-500",
          "text-black",

          "shadow-sm",
          "shadow-amber-500/10",

          "hover:bg-amber-400",
          "hover:shadow-md",
          "hover:shadow-amber-500/15",

          "active:translate-y-px",
        ].join(" "),

        secondary: [
          "border",
          "border-white/10",

          "bg-white/5",
          "text-white",

          "hover:border-white/20",
          "hover:bg-white/10",
        ].join(" "),

        outline: [
          "border",
          "border-white/15",

          "bg-transparent",
          "text-zinc-200",

          "hover:border-amber-500/40",
          "hover:bg-amber-500/5",
          "hover:text-amber-400",
        ].join(" "),

        ghost: [
          "bg-transparent",
          "text-zinc-400",

          "hover:bg-white/5",
          "hover:text-white",
        ].join(" "),

        link: [
          "bg-transparent",

          "text-amber-400",

          "underline-offset-4",

          "hover:text-amber-300",
          "hover:underline",
        ].join(" "),

        destructive: [
          "bg-red-600",
          "text-white",

          "hover:bg-red-500",

          "focus-visible:ring-red-500/40",
        ].join(" "),

        danger: [
          "bg-red-600",
          "text-white",

          "hover:bg-red-500",

          "focus-visible:ring-red-500/40",
        ].join(" "),
      },

      /* ===================================================
         SIZE
      =================================================== */

      size: {
        default: [
          "h-10",
          "px-4",
          "py-2",
        ].join(" "),

        sm: [
          "h-9",
          "rounded-md",
          "px-3",

          "text-xs",
        ].join(" "),

        lg: [
          "h-12",
          "rounded-xl",
          "px-6",

          "text-sm",
        ].join(" "),

        icon: [
          "h-10",
          "w-10",
          "p-0",
        ].join(" "),
      },

      /* ===================================================
         FULL WIDTH
      =================================================== */

      fullWidth: {
        true: "w-full",
        false: "",
      },
    },

    defaultVariants: {
      variant: "default",
      size: "default",
      fullWidth: false,
    },
  },
);

/* =========================================================
   BACKWARD-COMPATIBLE ALIAS

   Existing project code may use:

   buttonVariants(...)

   or:

   buttonStyles(...)
========================================================= */

const buttonStyles =
  buttonVariants;

/* =========================================================
   BUTTON PROPS
========================================================= */

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;

  /*
   * Shows a spinner and disables interaction.
   */
  loading?: boolean;

  /*
   * Optional text shown while loading.
   *
   * Example:
   *
   * <Button
   *   loading
   *   loadingText="Saving..."
   * >
   *   Save
   * </Button>
   */
  loadingText?: React.ReactNode;
}

/* =========================================================
   BUTTON COMPONENT
========================================================= */

const Button =
  React.forwardRef<
    HTMLButtonElement,
    ButtonProps
  >(
    (
      {
        className,

        variant,
        size,
        fullWidth,

        asChild = false,

        loading = false,
        loadingText,

        disabled,

        type,

        children,

        ...props
      },
      ref,
    ) => {
      const Comp =
        asChild
          ? Slot
          : "button";

      const isDisabled =
        Boolean(disabled) ||
        loading;

      return (
        <Comp
          ref={ref}
          type={
            asChild
              ? undefined
              : type ?? "button"
          }
          disabled={
            asChild
              ? undefined
              : isDisabled
          }
          aria-disabled={
            isDisabled
              ? true
              : undefined
          }
          aria-busy={
            loading
              ? true
              : undefined
          }
          className={cn(
            buttonVariants({
              variant,
              size,
              fullWidth,
            }),

            className,
          )}
          {...props}
        >
          {loading ? (
            <>
              <Loader2
                aria-hidden="true"
                className="size-4 animate-spin"
              />

              {loadingText ??
                children}
            </>
          ) : (
            children
          )}
        </Comp>
      );
    },
  );

Button.displayName =
  "Button";

/* =========================================================
   EXPORTS
========================================================= */

export {
  Button,
  buttonVariants,
  buttonStyles,
};