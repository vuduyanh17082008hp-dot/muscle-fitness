export interface SlideMeta {
  id: string;
  number: number;
  title: string;
  headline: string;
  section: string;
  durationSec: number;
  notes: string;
}

export const SLIDE_LIST: SlideMeta[] = [
  {
    id: "01-opening",
    number: 1,
    title: "Title & Hook",
    headline: "FITNESS INFORMATION IS EVERYWHERE. GOOD DECISIONS AREN'T.",
    section: "VISION",
    durationSec: 15,
    notes: "Fitness information is everywhere. Good decisions aren't. That's the problem we're solving. Welcome to Muscle Fitness—where fragmented data becomes intelligent, safe, personalized direction."
  },
  {
    id: "02-challenge",
    number: 2,
    title: "Challenge Alignment",
    headline: "AI SHOULD MAKE WELLBEING MORE ACCESSIBLE.",
    section: "VISION",
    durationSec: 15,
    notes: "Our platform hits four key pillars: physical wellbeing, economic accessibility, linguistic inclusion, and evidence-informed impact. Translation? We're bringing personal coaching to people who can't afford a hundred bucks an hour for a human trainer. Because good guidance shouldn't be a luxury."
  },
  {
    id: "03-problem",
    number: 3,
    title: "The Problem",
    headline: "MORE DATA. MORE ADVICE. STILL NO CLEAR DECISION.",
    section: "PROBLEM",
    durationSec: 15,
    notes: "Here's the modern athlete's dilemma. Training logs in one app. Calories in another. Generic chatbots hallucinating workouts like they're on a bad trip. Social media pushing contradictory advice. And the user? Stuck in the middle, paralyzed. It's like trying to navigate a storm with ten maps and no compass."
  },
  {
    id: "04-users",
    number: 4,
    title: "Target Users",
    headline: "BUILT FOR PEOPLE WHO DON'T HAVE A COACH BESIDE THEM EVERY DAY.",
    section: "PROBLEM",
    durationSec: 10,
    notes: "We build for beginners, busy students, everyday gym goers, multilingual users, and anyone intimidated by complex jargon. They don't need raw numbers. They need empathetic, clear direction. Someone to say, 'Hey, you got this. Here's your next step.'"
  },
  {
    id: "05-solution",
    number: 5,
    title: "The Solution",
    headline: "ONE CONTEXT. ONE COACH. BETTER DECISIONS.",
    section: "SOLUTION",
    durationSec: 15,
    notes: "Muscle Fitness unifies Training, Nutrition, Recovery, and Progress into a single context engine—powered by Dante, our specialized AI coaching layer. One context. One coach. Better decisions."
  },
  {
    id: "06-ecosystem",
    number: 6,
    title: "Muscle Fitness Ecosystem",
    headline: "MUSCLE FITNESS ECOSYSTEM",
    section: "SOLUTION",
    durationSec: 20,
    notes: "This is our signature orbital architecture. At the core sits Dante. Orbiting Dante are the four operational pillars—Training, Nutrition, Recovery, and Progress—all encircled by rich user profile, goal, and fatigue context. Think of it as a solar system where every planet speaks the same language."
  },
  {
    id: "07-working-product",
    number: 7,
    title: "Working Product",
    headline: "THIS IS NOT A CONCEPT. A WORKING PRODUCT.",
    section: "PRODUCT",
    durationSec: 15,
    notes: "Muscle Fitness is a live, production-ready full-stack application built with Next.js 16, Supabase, and custom deterministic safety rules. Everything you see today is fully functional. No mockups. No smoke and mirrors. Just real code doing real work."
  },
  {
    id: "08-demo-flow",
    number: 8,
    title: "Golden User Journey",
    headline: "FROM CONTEXT TO ACTION.",
    section: "PRODUCT",
    durationSec: 15,
    notes: "An athlete sets up their profile, checks daily readiness on the dashboard, logs workouts and macro fuel, monitors recovery, and receives instant, safe coaching adjustments from Dante. From context to action—smooth as butter."
  },
  {
    id: "09-dante",
    number: 9,
    title: "Dante AI Engine",
    headline: "NOT JUST A CHATBOT. A CONTEXT-AWARE AI COACHING LAYER.",
    section: "AI ARCHITECTURE",
    durationSec: 20,
    notes: "Dante is not a generic ChatGPT wrapper or a mascot. Dante is an active intelligence node with persistent memory of athlete fatigue, historical volume, dietary goals, and physical limitations. It remembers. It adapts. It cares—well, as much as code can care."
  },
  {
    id: "10-ai-pipeline",
    number: 10,
    title: "Controlled AI Pipeline",
    headline: "THE MODEL IS NOT THE SYSTEM.",
    section: "AI ARCHITECTURE",
    durationSec: 20,
    notes: "Generic AI feeds unconstrained prompts directly to an LLM, leading to workout hallucinations and dangerous injury advice. Dante passes user intent through scope filters, evidence gates, and clinical safety checks before generating a single word. The model is not the system. The system is the safety net."
  },
  {
    id: "11-evidence",
    number: 11,
    title: "Evidence Control",
    headline: "PERSONAL CLAIMS NEED EVIDENCE.",
    section: "RESPONSIBLE AI",
    durationSec: 20,
    notes: "We enforce strict evidence tiers. Public knowledge is allowed. User state claims require logged data. Specific readiness claims require hard telemetry. Any unsupported physiological claim is automatically intercepted. Personal claims need evidence. Period."
  },
  {
    id: "12-safety",
    number: 12,
    title: "Clinical Safety",
    headline: "SAFE ENOUGH TO KNOW ITS LIMITS.",
    section: "RESPONSIBLE AI",
    durationSec: 20,
    notes: "If a user says 'My knee hurts,' a generic LLM might diagnose a torn ACL. Dante explicitly refuses medical diagnosis, advises resting the joint, suggests painless variations, and recommends consulting a licensed professional. Safe enough to know its limits."
  },
  {
    id: "13-accessibility",
    number: 13,
    title: "Accessibility & Communication",
    headline: "SAME TRUTH. BETTER COMMUNICATION.",
    section: "RESPONSIBLE AI",
    durationSec: 15,
    notes: "Dante adapts communication dynamically—offering plain language, multilingual support, and verbosity controls. Crucially: hiding complex charts does not mean hiding data from the coaching engine. Same truth. Better communication."
  },
  {
    id: "14-architecture",
    number: 14,
    title: "System Architecture",
    headline: "AI INSIDE A CONTROLLED PRODUCT SYSTEM.",
    section: "TECHNICAL ARCHITECTURE",
    durationSec: 15,
    notes: "Our architecture combines Next.js App Router, Supabase Auth with Row Level Security, local state persistence, and deterministic AI guardrails. AI inside a controlled product system."
  },
  {
    id: "15-responsible-ai",
    number: 15,
    title: "Responsible AI Controls",
    headline: "PERSONALISED DOESN'T MEAN UNCONTROLLED.",
    section: "RESPONSIBLE AI",
    durationSec: 15,
    notes: "Five safety rings surround Dante on every turn: Context, Evidence, Decision, Safety, and Communication Adaptation. Personalized doesn't mean uncontrolled."
  },
  {
    id: "16-surprise-features",
    number: 16,
    title: "System Adaptability",
    headline: "BUILT TO ADAPT WITHOUT BREAKING THE CORE.",
    section: "EXTENSIBILITY",
    durationSec: 15,
    notes: "Our zero-breaking-change adapter layer allows instant expansion. Here are two expansion modules ready for future reveal without altering core safety guarantees. Built to adapt without breaking the core."
  },
  {
    id: "17-impact",
    number: 17,
    title: "Impact & Validation",
    headline: "RESPONSIBLE GUIDANCE WHEN A TRAINER ISN'T AVAILABLE.",
    section: "IMPACT",
    durationSec: 20,
    notes: "We bridge the gap when human trainers are unavailable. We proudly display 'Validation in progress' as empirical user testing continues. Responsible guidance when a trainer isn't available."
  },
  {
    id: "18-closing",
    number: 18,
    title: "Closing",
    headline: "WE ARE NOT TRYING TO REPLACE PERSONAL TRAINERS. WE ARE MAKING RESPONSIBLE, PERSONALISED FITNESS GUIDANCE ACCESSIBLE WHEN ONE ISN'T THERE.",
    section: "CLOSING",
    durationSec: 20,
    notes: "We are not trying to replace personal trainers. We are making responsible, personalized fitness guidance accessible when one isn't there. Muscle Fitness: Train Smarter. Decide Better. Thank you."
  }
];
