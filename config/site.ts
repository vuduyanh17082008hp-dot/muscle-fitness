export type NavigationItem = {
  title: string
  href: string
}

export type SiteConfig = {
  name: string
  description: string
  navigation: {
    marketing: NavigationItem[]
    dashboard: NavigationItem[]
  }
}

export const siteConfig: SiteConfig = {
  name: "Muscle Fitness",

  description:
    "A modern fitness coaching platform for training, nutrition, progress tracking and long-term transformation.",

  navigation: {
    marketing: [
      {
        title: "Home",
        href: "/",
      },
      {
        title: "My Story",
        href: "/story",
      },
      {
        title: "Training",
        href: "/training",
      },
      {
        title: "Nutrition",
        href: "/nutrition",
      },
      {
        title: "Pricing",
        href: "/#pricing",
      },
    ],

    dashboard: [
      {
        title: "Overview",
        href: "/dashboard",
      },
      {
        title: "Training",
        href: "/dashboard/training",
      },
      {
        title: "Nutrition",
        href: "/dashboard/nutrition",
      },
      {
        title: "Progress",
        href: "/dashboard/progress",
      },
      {
        title: "AI Coach",
        href: "/coach",
      },
    ],
  },
}

export default siteConfig