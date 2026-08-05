import type { Metadata, Viewport } from "next"
import type { ReactNode } from "react"

import { AuthProvider } from "@/app/context/AuthContext"

import "./globals.css"

export const metadata: Metadata = {
  title: {
    default: "Muscle Fitness",
    template: "%s | Muscle Fitness",
  },

  description:
    "A modern fitness platform for personalised training, nutrition, progress tracking and long-term transformation.",

  applicationName: "Muscle Fitness",

  keywords: [
    "Muscle Fitness",
    "fitness",
    "workout",
    "nutrition",
    "training",
    "body transformation",
    "fitness coaching",
  ],

  authors: [
    {
      name: "Muscle Fitness",
    },
  ],

  creator: "Muscle Fitness",
  publisher: "Muscle Fitness",

  category: "fitness",

  icons: {
    icon: [
      {
        url: "/favicon.ico",
      },
    ],
    shortcut: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },

  openGraph: {
    type: "website",
    locale: "en_SG",
    siteName: "Muscle Fitness",
    title: "Muscle Fitness",
    description:
      "Personalised training, nutrition and progress tracking built for real transformation.",
  },

  twitter: {
    card: "summary_large_image",
    title: "Muscle Fitness",
    description:
      "Personalised training, nutrition and progress tracking built for real transformation.",
  },

  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",

  themeColor: [
    {
      media: "(prefers-color-scheme: light)",
      color: "#070707",
    },
    {
      media: "(prefers-color-scheme: dark)",
      color: "#070707",
    },
  ],

  colorScheme: "dark",
}

type RootLayoutProps = Readonly<{
  children: ReactNode
}>

export default function RootLayout({
  children,
}: RootLayoutProps) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
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
  )
}