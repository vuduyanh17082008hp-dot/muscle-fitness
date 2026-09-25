export const DECK_THEME = {
  colors: {
    bg: {
      deep: "#050607",
      main: "#07090D",
      elevated: "#0A0D12",
    },
    surface: {
      card: "#11151B",
      glass: "rgba(22, 27, 34, 0.75)",
      border: "rgba(255, 255, 255, 0.08)",
      borderActive: "rgba(200, 255, 61, 0.4)",
    },
    accent: {
      lime: "#C8FF3D", // Primary Accent - Active signal, intelligence, progress
      blue: "#59A9FF", // Secondary Accent - Data, structure, system
      purple: "#8D7CFF", // Micro Accent - Neural, Dante node
      cyan: "#38BDF8", // Auxiliary stream
      amber: "#F59E0B", // Warning / Evidence alert
      emerald: "#10B981", // Validated status
    },
    text: {
      primary: "#F6F7F9",
      secondary: "#989FAA",
      muted: "#5A6270",
      limeHighlight: "#C8FF3D",
    }
  },
  fonts: {
    heading: "'Onest', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    body: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    mono: "'JetBrains Mono', 'Fira Code', monospace",
  },
  shadows: {
    limeGlow: "0 0 30px rgba(200, 255, 61, 0.15)",
    blueGlow: "0 0 30px rgba(89, 169, 255, 0.15)",
    purpleGlow: "0 0 30px rgba(141, 124, 255, 0.15)",
    cardGlass: "0 20px 40px -15px rgba(0, 0, 0, 0.7)",
  }
} as const;
