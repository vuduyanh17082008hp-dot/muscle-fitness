import type {
  Metadata,
  Viewport,
} from "next";

import type {
  ReactNode,
} from "react";

import {
  Inter,
  Barlow_Condensed,
  Bebas_Neue,
} from "next/font/google";

import {
  AuthProvider,
} from "@/app/context/AuthContext";

import "./globals.css";

/*
 * Typography system:
 *  - Inter        -> UI / body / data (var(--font-inter))
 *  - Barlow Condensed -> display / section / sport headings, the
 *    default for every h1-h6 (var(--font-barlow-condensed))
 *  - Bebas Neue   -> rare brand/campaign moments only, e.g. the
 *    wordmark (var(--font-bebas)) — never the general heading font
 *
 * These were previously referenced as CSS custom properties in
 * globals.css (--font-body / --font-heading) but never actually
 * loaded anywhere, so the whole app was silently rendering in the
 * fallback stack (Arial / Impact) instead of the intended typeface.
 */

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const barlowCondensed = Barlow_Condensed({
  subsets: ["latin"],
  // 86+ existing components pair a heading element with Tailwind's
  // font-black (900)/font-bold (700)/font-semibold (600) utilities;
  // loading all the weights those actually request avoids browser
  // font-synthesis (fake bold) on every one of them.
  weight: ["500", "600", "700", "900"],
  variable: "--font-barlow-condensed",
  display: "swap",
});

const bebasNeue = Bebas_Neue({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-bebas",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default:
      "Muscle Fitness — AI-Powered Personal Training",

    template:
      "%s | Muscle Fitness",
  },

  description:
    "An evidence-aware AI fitness coaching platform connecting training, nutrition, recovery and personalized guidance through Dante.",

  applicationName:
    "Muscle Fitness",

  keywords: [
    "Muscle Fitness",
    "AI fitness coach",
    "Dante AI",
    "workout programming",
    "nutrition",
    "recovery",
    "personal training",
    "fitness coaching",
  ],

  authors: [
    {
      name:
        "Muscle Fitness",
    },
  ],

  creator:
    "Muscle Fitness",

  publisher:
    "Muscle Fitness",

  category:
    "fitness",

  icons: {
    icon: [
      {
        url:
          "/favicon.ico",
      },
    ],

    shortcut:
      "/favicon.ico",

    apple:
      "/apple-touch-icon.png",
  },

  openGraph: {
    type:
      "website",

    locale:
      "en_SG",

    siteName:
      "Muscle Fitness",

    title:
      "Muscle Fitness — AI-Powered Personal Training",

    description:
      "Training, nutrition and recovery guidance built around your real profile, goals and progress.",
  },

  twitter: {
    card:
      "summary_large_image",

    title:
      "Muscle Fitness — AI-Powered Personal Training",

    description:
      "Training, nutrition and recovery guidance built around your real profile, goals and progress.",
  },

  robots: {
    index:
      true,

    follow:
      true,

    googleBot: {
      index:
        true,

      follow:
        true,

      "max-image-preview":
        "large",

      "max-snippet":
        -1,

      "max-video-preview":
        -1,
    },
  },
};

export const viewport: Viewport = {
  width:
    "device-width",

  initialScale:
    1,

  maximumScale:
    5,

  viewportFit:
    "cover",

  themeColor: [
    {
      media:
        "(prefers-color-scheme: light)",

      color:
        "#070707",
    },

    {
      media:
        "(prefers-color-scheme: dark)",

      color:
        "#070707",
    },
  ],

  colorScheme:
    "dark",
};

type RootLayoutProps =
  Readonly<{
    children:
      ReactNode;
  }>;

export default function RootLayout({
  children,
}: RootLayoutProps) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${barlowCondensed.variable} ${bebasNeue.variable}`}
    >
      <body
        className="
          min-h-screen
          overflow-x-hidden

          bg-[#070707]
          text-white

          antialiased

          selection:bg-amber-500
          selection:text-black
        "
      >
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}