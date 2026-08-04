export type Workout = {
  id: string;
  title: string;
  focus: string;
  durationMin: number;
  difficulty: "Beginner" | "Intermediate" | "Advanced";
  moves: string[];
};

export const workouts: Workout[] = [
  {
    id: "push-power",
    title: "Push Power",
    focus: "Chest · Shoulders · Triceps",
    durationMin: 42,
    difficulty: "Intermediate",
    moves: ["Bench press", "Overhead press", "Dips", "Lateral raises"],
  },
  {
    id: "posterior-chain",
    title: "Posterior Chain",
    focus: "Back · Hamstrings · Glutes",
    durationMin: 48,
    difficulty: "Advanced",
    moves: ["Deadlift", "Row", "Hip thrust", "Face pulls"],
  },
  {
    id: "engine-day",
    title: "Engine Day",
    focus: "Conditioning · Core",
    durationMin: 30,
    difficulty: "Beginner",
    moves: ["Row intervals", "Kettlebell swings", "Plank", "Bike sprints"],
  },
  {
    id: "leg-drive",
    title: "Leg Drive",
    focus: "Quads · Calves · Core",
    durationMin: 45,
    difficulty: "Intermediate",
    moves: ["Front squat", "Lunges", "Calf raises", "Hanging knee raises"],
  },
];

export const progressSeries = [
  { week: "W1", volume: 8200, strength: 62 },
  { week: "W2", volume: 9100, strength: 65 },
  { week: "W3", volume: 8800, strength: 67 },
  { week: "W4", volume: 10200, strength: 71 },
  { week: "W5", volume: 11100, strength: 74 },
  { week: "W6", volume: 11850, strength: 78 },
];

export const pricing = [
  {
    id: "starter",
    name: "Starter",
    price: "$0",
    cadence: "forever",
    blurb: "Track sessions and browse starter programs.",
    features: ["Workout library", "Basic progress log", "Community tips"],
    cta: "Start free",
    featured: false,
  },
  {
    id: "pro",
    name: "Pro",
    price: "$19",
    cadence: "/month",
    blurb: "AI coaching, form checks, and adaptive plans.",
    features: [
      "AI coach chat",
      "Webcam form feedback",
      "Adaptive weekly plans",
      "Progress analytics",
    ],
    cta: "Go Pro",
    featured: true,
  },
];
