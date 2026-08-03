import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        brand: { 50: "#f0fdf4", 500: "#22c55e", 600: "#16a34a", 900: "#14532d" },
        surface: { light: "#ffffff", dark: "#0f172a" },
      },
    },
  },
  plugins: [],
};
export default config;