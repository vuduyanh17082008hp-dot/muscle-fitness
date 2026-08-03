export type NavItem = {
  label: string;
  href: string;
};

export type SocialItem = {
  label: string;
  shortLabel: string;
  href: string;
};

export const siteConfig = {
  name: "Muscle Fitness",

  shortName: "MF",

  description:
    "A discipline-driven fitness platform for personalized training, nutrition and complete body transformation.",

  quote:
    "You will always wish you started sooner. Today is the youngest you will ever be.",

  navItems: [
    {
      label: "Home",
      href: "/",
    },
    {
      label: "My Story",
      href: "/story",
    },
    {
      label: "Training",
      href: "/training",
    },
    {
      label: "Meal Plan",
      href: "/meal-plan",
    },
    {
      label: "Pricing",
      href: "/pricing",
    },
    {
      label: "Contact",
      href: "/contact",
    },
  ] satisfies NavItem[],

  auth: {
    login: "/login",
    startJourney: "/onboarding",
  },

  supportItems: [
    {
      label: "FAQ",
      href: "/faq",
    },
    {
      label: "Privacy Policy",
      href: "/privacy",
    },
    {
      label: "Terms of Service",
      href: "/terms",
    },
    {
      label: "Contact",
      href: "/contact",
    },
  ] satisfies NavItem[],

  socials: [
    {
      label: "Instagram",
      shortLabel: "IG",
      href: "https://instagram.com/your_username",
    },
    {
      label: "TikTok",
      shortLabel: "TT",
      href: "https://tiktok.com/@your_username",
    },
    {
      label: "YouTube",
      shortLabel: "YT",
      href: "https://youtube.com/@your_username",
    },
    {
      label: "Email",
      shortLabel: "@",
      href: "mailto:your-email@example.com",
    },
  ] satisfies SocialItem[],
} as const;