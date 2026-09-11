import type { VisualOverlayVariant } from "@/components/visual/visual-overlay";

export type PageVisualKey =
  | "home"
  | "firstRep"
  | "training"
  | "trainingIntelligence"
  | "trainingSplit"
  | "formCoach"
  | "nutrition"
  | "mealPlan"
  | "shoppingList"
  | "recovery"
  | "progress"
  | "dante"
  | "business"
  | "responsibleAi"
  | "onboarding";

export type PageVisualConfig = {
  /** Real asset path under /public/visuals — omit until generated (see docs/AI_VISUAL_PROMPTS.md). */
  imageSrc?: string;
  imageAlt: string;
  overlayVariant: VisualOverlayVariant;
  intensity: "secondary" | "prominent";
  /** Matches the NAME field in docs/AI_VISUAL_PROMPTS.md, for traceability. */
  promptRef: string;
};

/**
 * Central page → visual mapping (spec: "pageVisuals"). Public/marketing
 * pages may run "prominent"; authenticated data pages stay "secondary"
 * so imagery never competes with charts, forms or logged data.
 */
export const pageVisuals: Record<PageVisualKey, PageVisualConfig> = {
  home: {
    imageAlt: "",
    overlayVariant: "telemetry",
    intensity: "prominent",
    promptRef: "home-performance",
  },
  firstRep: {
    imageSrc: "/story/images/the-beginning.jpg",
    imageAlt: "",
    overlayVariant: "grid",
    intensity: "secondary",
    promptRef: "first-rep",
  },
  training: {
    imageAlt: "",
    overlayVariant: "telemetry",
    intensity: "secondary",
    promptRef: "training-intelligence",
  },
  trainingIntelligence: {
    imageAlt: "",
    overlayVariant: "telemetry",
    intensity: "secondary",
    promptRef: "training-intelligence",
  },
  trainingSplit: {
    imageAlt: "",
    overlayVariant: "telemetry",
    intensity: "secondary",
    promptRef: "training-split",
  },
  formCoach: {
    imageAlt: "",
    overlayVariant: "telemetry",
    intensity: "secondary",
    promptRef: "form-coach",
  },
  nutrition: {
    imageAlt: "",
    overlayVariant: "grid",
    intensity: "secondary",
    promptRef: "nutrition-performance",
  },
  mealPlan: {
    imageAlt: "",
    overlayVariant: "grid",
    intensity: "secondary",
    promptRef: "meal-system",
  },
  shoppingList: {
    imageAlt: "",
    overlayVariant: "grid",
    intensity: "secondary",
    promptRef: "shopping-system",
  },
  recovery: {
    imageAlt: "",
    overlayVariant: "waveform",
    intensity: "secondary",
    promptRef: "recovery-intelligence",
  },
  progress: {
    imageAlt: "",
    overlayVariant: "waveform",
    intensity: "secondary",
    promptRef: "progress-intelligence",
  },
  dante: {
    imageAlt: "",
    overlayVariant: "nodes",
    intensity: "secondary",
    promptRef: "dante-intelligence",
  },
  business: {
    imageAlt: "",
    overlayVariant: "nodes",
    intensity: "secondary",
    promptRef: "business-intelligence",
  },
  responsibleAi: {
    imageAlt: "",
    overlayVariant: "grid",
    intensity: "secondary",
    promptRef: "responsible-ai",
  },
  onboarding: {
    imageAlt: "",
    overlayVariant: "grid",
    intensity: "secondary",
    promptRef: "onboarding-performance",
  },
};
