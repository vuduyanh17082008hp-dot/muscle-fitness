export type NavigationItem = {
  title: string;
  href: string;
};

export const siteConfig = {
  name: "MuscleFitness",

  description:
    "Nền tảng luyện tập, dinh dưỡng và AI Coach được cá nhân hóa.",

  navigation: {
    dashboard: [
      {
        title: "Tổng quan",
        href: "/dashboard",
      },
      {
        title: "Kế hoạch ăn uống",
        href: "/meal-plan",
      },
      {
        title: "AI Coach",
        href: "/coach",
      },
    ] satisfies readonly NavigationItem[],
  },
} as const;