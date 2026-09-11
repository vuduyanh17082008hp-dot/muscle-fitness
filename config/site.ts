export type NavigationItem = {
  title: string;
  href: string;
};

export type SiteConfig = {
  name: string;

  description:
    string;

  navigation: {
    marketing:
      NavigationItem[];

    dashboard:
      NavigationItem[];
  };
};

export const siteConfig: SiteConfig = {
  name:
    "Muscle Fitness",

  description:
    "An evidence-aware AI fitness coaching platform connecting training, nutrition, recovery and personalized guidance.",

  navigation: {
    marketing: [
      {
        title:
          "Home",

        href:
          "/",
      },

      {
        title:
          "Solution",

        href:
          "/#solution",
      },

      {
        title:
          "Dante",

        href:
          "/chatbot",
      },

      {
        title:
          "Training",

        href:
          "/training",
      },

      {
        title:
          "AI Fair",

        href:
          "/ai-fair",
      },

      {
        title:
          "Responsible AI",

        href:
          "/responsible-ai",
      },
    ],

    dashboard: [
      {
        title:
          "Overview",

        href:
          "/dashboard",
      },

      {
        title:
          "Training",

        href:
          "/dashboard/training",
      },

      {
        title:
          "Training Intelligence",

        href:
          "/dashboard/training-intelligence",
      },

      {
        title:
          "Nutrition",

        href:
          "/dashboard/nutrition",
      },

      {
        title:
          "Recovery",

        href:
          "/dashboard/recovery",
      },

      {
        title:
          "Progress",

        href:
          "/dashboard/progress",
      },

      {
        title:
          "Dante",

        href:
          "/coach",
      },
    ],
  },
};

export default siteConfig;