import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [],
  },
  async redirects() {
    return [
      { source: "/my-story", destination: "/story", permanent: true },
      { source: "/today", destination: "/dashboard/today", permanent: false },
      {
        source: "/check-in",
        destination: "/dashboard/check-in",
        permanent: false,
      },
      {
        source: "/workouts",
        destination: "/dashboard/workouts",
        permanent: false,
      },
      {
        source: "/nutrition",
        destination: "/dashboard/nutrition",
        permanent: false,
      },
      {
        source: "/progress",
        destination: "/dashboard/progress",
        permanent: false,
      },
      {
        source: "/messages",
        destination: "/dashboard/messages",
        permanent: false,
      },
      {
        source: "/calendar",
        destination: "/dashboard/calendar",
        permanent: false,
      },
      {
        source: "/settings",
        destination: "/dashboard/settings",
        permanent: false,
      },
      {
        source: "/auth/signout",
        destination: "/auth/singout",
        permanent: false,
      },
      {
        source: "/auth/login",
        destination: "/login",
        permanent: true,
      },
      {
        source: "/auth/callback",
        destination: "/callback",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
