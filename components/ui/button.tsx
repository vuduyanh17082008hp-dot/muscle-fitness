import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import {
  cva,
  type VariantProps,
} from "class-variance-authority";

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
      variant: {
        /* =================================================
           DEFAULT
        ================================================= */

        default: [
          "bg-amber-500",
          "text-black",

          "hover:bg-amber-400",

          "active:translate-y-px",
        ].join(" "),

        /* =================================================
           PRIMARY
        ================================================= */

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

        /* =================================================
           SECONDARY
        ================================================= */

        secondary: [
          "border",
          "border-white/10",

          "bg-white/5",
          "text-white",

          "hover:border-white/20",
          "hover:bg-white/10",
        ].join(" "),

        /* =================================================
           OUTLINE
        ================================================= */

        outline: [
          "border",
          "border-white/15",

          "bg-transparent",
          "text-zinc-200",

          "hover:border-amber-500/40",
          "hover:bg-amber-500/5",
          "hover:text-amber-400",
        ].join(" "),

        /* =================================================
           GHOST
        ================================================= */

        ghost: [
          "bg-transparent",
          "text-zinc-400",

          "hover:bg-white/5",
          "hover:text-white",
        ].join(" "),

        /* =================================================
           LINK
        ================================================= */

        link: [
          "bg-transparent",

          "text-amber-400",

          "underline-offset-4",

          "hover:text-amber-300",
          "hover:underline",
        ].join(" "),

        /* =================================================
           DESTRUCTIVE
        ================================================= */

        destructive: [
          "bg-red-600",
          "text-white",

          "hover:bg-red-500",

          "focus-visible:ring-red-500/40",
        ].join(" "),

        /* =================================================
           DANGER

           Used by Muscle Fitness design system.
        ================================================= */

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

         Supports:

         <Button fullWidth />

         and:

         buttonStyles({
           fullWidth: true
         })
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

   Existing code:
   buttonVariants(...)

   New Muscle Fitness code:
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
        type,
        ...props
      },
      ref,
    ) => {
      const Comp =
        asChild
          ? Slot
          : "button";

      return (
        <Comp
          ref={ref}
          type={
            asChild
              ? undefined
              : type ?? "button"
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
        />
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