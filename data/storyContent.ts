export type StoryTheme =
  | "dark"
  | "steel"
  | "bronze"
  | "red"
  | "crimson"
  | "gold"

export type StoryMedia = {
  src: string
  alt: string
  type?: "image" | "video"
  autoplay?: boolean
  poster?: string
  loop?: boolean
  controls?: boolean
  objectPosition?: string
  caption?: string
}

export type StoryIdentity = {
  eyebrow: string
  title: string
  description: string
  quote: string
}

export type StoryMilestone = {
  year: string
  title: string
  description: string
  quote: string
}

export type StoryTimeline = {
  eyebrow: string
  title: string
  description: string
  milestones: StoryMilestone[]
}

export type TransformationSide = {
  label: string
  weight: string
  title: string
  description: string
  traits: string[]
}

export type TransformationContent = {
  eyebrow: string
  title: string
  description: string
  before: TransformationSide
  after: TransformationSide
}

export type StoryStat = {
  label: string
  value: number
  suffix: string
  description: string
}

export type StoryChapterData = {
  id: string
  chapterNumber: number
  eyebrow: string
  title: string
  subtitle?: string
  paragraphs: string[]
  quote: string
  image?: string
  imageAlt?: string
  theme: StoryTheme
  reverse?: boolean
}

export type StoryContent = {
  identity: StoryIdentity
  timeline: StoryTimeline
  transformation: TransformationContent
  stats: StoryStat[]
  chapters: StoryChapterData[]
}

export const storyData: StoryContent = {
  identity: {
    eyebrow:
      "The reason behind Muscle Fitness",

    title:
      "I did not build this platform because transformation was easy.",

    description:
      "I built it because I remember what it felt like to feel trapped inside a body and mindset that no longer represented the person I wanted to become. Muscle Fitness is the system I wish I had when I first decided to change.",

    quote:
      "You will always wish you started sooner. But today is the youngest you will ever be.",
  },

  timeline: {
    eyebrow:
      "The transformation timeline",

    title:
      "The body changed after the mindset did.",

    description:
      "This was not one dramatic moment. It was a series of difficult decisions repeated until discipline became part of my identity.",

    milestones: [
      {
        year: "The beginning",
        title: "Living at 88 kilograms",
        description:
          "I felt uncomfortable in my own body. Running was difficult, confidence was low and I constantly compared myself with everyone around me.",
        quote:
          "The hardest weight was not on my body. It was in my mind.",
      },
      {
        year: "The turning point",
        title:
          "Deciding that enough was enough",
        description:
          "I stopped waiting for motivation and accepted that nobody else could make the decision for me. Change had to start with my own actions.",
        quote:
          "A different life required a different version of me.",
      },
      {
        year: "The difficult months",
        title:
          "Learning discipline through repetition",
        description:
          "Some sessions felt powerful. Others felt terrible. The real progress came from showing up on the days when I had no desire to train.",
        quote:
          "Motivation started the journey. Discipline carried it.",
      },
      {
        year: "The breakthrough",
        title: "Reaching 68 kilograms",
        description:
          "The number mattered, but the person I had become mattered more. I had learned patience, structure and the ability to keep promises to myself.",
        quote:
          "The body was evidence of the standards I had built.",
      },
      {
        year: "The next chapter",
        title:
          "Building muscle and confidence",
        description:
          "Fat loss was not the end. I began learning about hypertrophy, nutrition, recovery and sustainable performance.",
        quote:
          "Transformation is not a finish line. It is a new foundation.",
      },
      {
        year: "Today",
        title:
          "Creating Muscle Fitness",
        description:
          "I created Muscle Fitness to give others a clearer path—one built around personal data, practical plans, accountability and long-term progression.",
        quote:
          "The struggle became the reason I could guide someone else.",
      },
    ],
  },

  transformation: {
    eyebrow: "88 kg to 68 kg",

    title:
      "The visible transformation was only part of the story.",

    description:
      "The greatest change was learning how to act even when confidence, energy and motivation were missing.",

    before: {
      label: "Before",
      weight: "88 kg",
      title:
        "Existing without direction",
      description:
        "Low confidence, inconsistent habits and no clear system for training or nutrition.",
      traits: [
        "Avoided difficult physical activity",
        "Relied on temporary motivation",
        "Felt controlled by insecurity",
        "Had no measurable plan",
      ],
    },

    after: {
      label: "After",
      weight: "68 kg",
      title: "Living with standards",
      description:
        "A structured approach to training, nutrition, recovery and personal responsibility.",
      traits: [
        "Trained with consistency",
        "Built repeatable nutrition habits",
        "Tracked progress objectively",
        "Developed confidence through action",
      ],
    },
  },

  stats: [
    {
      label: "Weight lost",
      value: 20,
      suffix: " kg",
      description:
        "A gradual transformation from 88 kg to 68 kg.",
    },
    {
      label: "Training experience",
      value: 2,
      suffix: "+ years",
      description:
        "Time spent learning training, nutrition and recovery.",
    },
    {
      label: "Commitment",
      value: 100,
      suffix: "%",
      description:
        "Built through consistency rather than perfect motivation.",
    },
    {
      label: "Mission",
      value: 1,
      suffix: "",
      description:
        "Help others build a transformation they can maintain.",
    },
  ],

  chapters: [
    {
      id: "the-beginning",
      chapterNumber: 1,
      eyebrow: "The Beginning",
      title:
        "Before the transformation, I was fighting a battle nobody could see.",
      subtitle:
        "The first chapter was not about fitness. It was about feeling trapped.",

      paragraphs: [
        "At 88 kilograms, ordinary activities felt more difficult than they should have. Running exhausted me quickly, clothing never felt right and every photograph became something I wanted to avoid.",

        "The physical discomfort was real, but the deeper struggle lived in my mind. I became quiet, insecure and increasingly afraid of how other people saw me.",

        "I kept telling myself I would change eventually. Eventually became next week, then next month, while my confidence continued to disappear.",
      ],

      quote:
        "The hardest weight I carried was the belief that I could not change.",

      image: "/images/story/beginning.jpg",
      imageAlt:
        "The beginning of the Muscle Fitness transformation journey",

      theme: "dark",
    },

    {
      id: "shame-and-rejection",
      chapterNumber: 2,
      eyebrow:
        "Shame and Rejection",
      title:
        "Sometimes pain becomes the moment you can no longer ignore.",
      subtitle:
        "Rejection hurt, but remaining the same began to hurt even more.",

      paragraphs: [
        "There were moments when I felt judged before I had the opportunity to show who I was. I allowed appearance, comparison and rejection to determine how much confidence I believed I deserved.",

        "For a long time, I treated the pain as proof that something was wrong with me. Eventually, I understood that pain could also become information. It was showing me that I could no longer accept the life I was living.",

        "That realization did not immediately make me fearless. It simply gave me a reason strong enough to begin.",
      ],

      quote:
        "Rejection did not finish me. It forced me to meet the person I needed to become.",

      theme: "red",
      reverse: true,
    },

    {
      id: "the-decision",
      chapterNumber: 3,
      eyebrow:
        "The Decision to Change",
      title:
        "Nothing changed until I stopped negotiating with myself.",
      subtitle:
        "The turning point was a decision repeated every day.",

      paragraphs: [
        "I stopped waiting to feel ready. I did not have a perfect program, perfect nutrition knowledge or unlimited confidence. I only had the decision to take one honest step forward.",

        "The first workouts were uncomfortable. My fitness was poor, my technique needed work and progress felt painfully slow.",

        "But each session became evidence that I was no longer the person who always quit. Every completed workout was a promise kept.",
      ],

      quote:
        "A different future began when excuses stopped controlling the present.",

      theme: "bronze",
    },

    {
      id: "discipline",
      chapterNumber: 4,
      eyebrow:
        "Discipline Over Motivation",
      title:
        "The days I wanted to quit were the days that built me.",
      subtitle:
        "Motivation was temporary. Standards had to become permanent.",

      paragraphs: [
        "Motivation helped me begin, but it was unreliable. Some mornings I felt powerful. On many others, I felt tired, discouraged or convinced that the effort was not working.",

        "I learned to train without needing every session to feel inspiring. I learned to prepare food when convenience was more attractive. I learned to keep going without immediate validation.",

        "Consistency became less about intensity and more about refusing to disappear from my own life.",
      ],

      quote:
        "Discipline is remembering what you want when comfort asks you to forget.",

      theme: "steel",
      reverse: true,
    },

    {
      id: "68-kilograms",
      chapterNumber: 5,
      eyebrow:
        "Reaching 68 Kilograms",
      title:
        "The scale showed what I lost, but not everything I gained.",
      subtitle:
        "Twenty kilograms disappeared. A stronger identity took their place.",

      paragraphs: [
        "Reaching 68 kilograms was emotional because it represented hundreds of decisions nobody else had witnessed.",

        "The result was not created by a single perfect month. It came from adjusting after mistakes, returning after difficult days and learning that progress could survive imperfection.",

        "I looked different, but the most valuable transformation was internal. I trusted myself more because I had finally built evidence that my actions could change my life.",
      ],

      quote:
        "The body became proof of the standards I had learned to protect.",

      theme: "bronze",
    },

    {
      id: "building-muscle",
      chapterNumber: 6,
      eyebrow:
        "Building Muscle and Confidence",
      title:
        "Losing weight was the beginning—not the final destination.",
      subtitle:
        "The next mission was to build strength, knowledge and purpose.",

      paragraphs: [
        "After the weight-loss phase, I became fascinated by training. I wanted to understand muscle growth, exercise selection, recovery, nutrition and progressive overload.",

        "Training was no longer punishment for how I looked. It became a skill, a discipline and a way to discover what my body could become.",

        "Confidence stopped being something I tried to manufacture mentally. It became the natural result of repeatedly doing difficult things.",
      ],

      quote:
        "Confidence was not found in the mirror. It was built through action.",

      theme: "steel",
      reverse: true,
    },

    {
      id: "why-muscle-fitness",
      chapterNumber: 7,
      eyebrow:
        "Why I Created Muscle Fitness",
      title:
        "My struggle became the foundation for something larger than myself.",
      subtitle:
        "Muscle Fitness exists to make transformation clearer, more personal and more sustainable.",

      paragraphs: [
        "When I began, I had no structured system connecting personal information, training, nutrition, recovery and progress tracking.",

        "Muscle Fitness was created to provide that system. It is designed to help people understand what to do, why they are doing it and how to adjust when life changes.",

        "This platform is not built around perfection. It is built around direction, accountability and the belief that a person can rebuild themselves through consistent action.",
      ],

      quote:
        "The journey that once made me feel alone became the reason I could help someone else begin.",

      theme: "dark",
    },
  ],
}

export const storyChapters = storyData.chapters

export const fourDPillars = [
  {
    title: "Dedication",
    text: "Showing up when the result is still invisible.",
  },
  {
    title: "Determination",
    text: "Continuing after the first wave of motivation fades.",
  },
  {
    title: "Drive",
    text: "Choosing the harder path because it builds the stronger self.",
  },
  {
    title: "Discipline",
    text: "Keeping the promise when nobody is watching.",
  },
] as const

export default storyData