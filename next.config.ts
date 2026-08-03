export const siteConfig = {
  name: "MuscleFitness",
  description:
    "Nền tảng luyện tập, dinh dưỡng và AI Coach được cá nhân hóa.",

  navigation: {
    marketing: [
      {
        href: "/",
        label: "Trang chủ",
      },
      {
        href: "/story",
        label: "Câu chuyện",
      },
    ],

    dashboard: [
      {
        href: "/dashboard",
        label: "Tổng quan",
      },
      {
        href: "/meal-plan",
        label: "Dinh dưỡng",
      },
      {
        href: "/coach",
        label: "AI Coach",
      },
    ],
  },
} as const;