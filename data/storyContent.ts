// data/storyContent.ts

export type StoryTheme = "dark" | "crimson" | "steel" | "gold";
export type StoryAlignment = "left" | "right";

export type StoryMedia = {
  type: "image" | "video";
  src: string;
  poster?: string;
  alt: string;
  caption?: string;
  objectPosition?: string;
  autoplay?: boolean;
  loop?: boolean;
  controls?: boolean;
};

export type StoryChapterData = {
  id: string;
  chapterNumber: string;
  eyebrow: string;
  title: string;
  paragraphs: string[];
  quote: string;
  media: StoryMedia;
  alignment: StoryAlignment;
  theme: StoryTheme;
};

export const storyChapters: StoryChapterData[] = [
  {
  id: "the-beginning",
  chapterNumber: "01",
  eyebrow: "THE BEGINNING",
  title: "Before the Transformation, I Was Hiding",
  paragraphs: [
    "There was a time when I tried to make myself smaller in every room I entered—not only physically, but emotionally.",
    "I avoided cameras, mirrors, crowded spaces and situations where I believed people might judge the way I looked.",
    "The journey did not begin with confidence. It began when I finally admitted that I was tired of living against myself.",
  ],
  quote:
    "The weight on my body was visible. The weight inside my mind was not.",
  media: {
    type: "image",
    src: "/story/images/the-beginning.jpeg",
    alt: "The beginning of my transformation journey among large rocks",
    caption:
      "Before the transformation began, I was still searching for my direction.",
    objectPosition: "center 65%",
  },
  alignment: "left",
  theme: "dark",
},

  {
    id: "living-at-88-kilograms",
    chapterNumber: "02",
    eyebrow: "LIVING AT 88 KILOGRAMS",
    title: "The Number Was Only Part of the Weight",
    paragraphs: [
      "At 88 kilograms, ordinary things felt harder than they should have. Running exhausted me. Clothes became something I used to hide instead of express myself.",
      "But the hardest part was not physical discomfort. It was the belief that I had lost control of the person I was becoming.",
      "I did not hate the person I was. I simply knew that he needed help, direction and one honest chance to begin again.",
    ],
    quote:
      "The hardest weight I carried was the belief that I would never be enough.",
    media: {
      type: "image",
      src: "/story/images/living-at-88kg.jpg",
      alt: "A respectful before-transformation fitness portrait",
      caption: "88 kg—the visible part of a much deeper struggle.",
      objectPosition: "center 30%",
    },
    alignment: "right",
    theme: "steel",
  },

  {
    id: "shame-and-rejection",
    chapterNumber: "03",
    eyebrow: "SHAME AND REJECTION",
    title: "Some Wounds Never Appeared in Photographs",
    paragraphs: [
      "Judgment and rejection made me question whether I deserved confidence before I had even earned the opportunity to build it.",
      "I began treating every glance as criticism and every silence as proof that something was wrong with me.",
      "Eventually, I understood that other people's reactions could hurt me, but they did not have the right to write the rest of my life.",
    ],
    quote:
      "I was not weak because I struggled. I became strong because I continued while struggling.",
    media: {
      type: "image",
      src: "/story/images/shame-and-rejection.jpg",
      alt: "A cinematic visual representing isolation and rejection",
      caption: "The emotional struggle was often invisible.",
      objectPosition: "center",
    },
    alignment: "left",
    theme: "crimson",
  },

  {
    id: "the-decision-to-change",
    chapterNumber: "04",
    eyebrow: "THE DECISION TO CHANGE",
    title: "Nobody Was Coming to Rescue Me",
    paragraphs: [
      "My turning point was not dramatic. There was no perfect speech, no sudden confidence and no promise that the journey would be easy.",
      "I simply realized that if I wanted a different future, I had to become responsible for creating it.",
      "That decision did not transform my body overnight. It transformed the direction of my life immediately.",
    ],
    quote:
      "I did not need to feel ready. I needed to stop negotiating with the life I no longer wanted.",
    media: {
      type: "image",
      src: "/story/images/decision-to-change.jpg",
      alt: "A person preparing to begin training in a dark gym",
      caption: "The moment direction became more important than comfort.",
      objectPosition: "center",
    },
    alignment: "right",
    theme: "dark",
  },

  {
    id: "the-first-difficult-months",
    chapterNumber: "05",
    eyebrow: "THE FIRST DIFFICULT MONTHS",
    title: "Progress Was Slow, but the Work Was Real",
    paragraphs: [
      "The first months were filled with cravings, exhausting workouts, uncertainty and days when the mirror seemed unchanged.",
      "I had to learn nutrition, portion control, recovery and training while still fighting the habits that had shaped my old life.",
      "There were no perfect weeks. There were only imperfect weeks in which I repeatedly chose to return.",
    ],
    quote:
      "Every workout was a vote for the person I wanted to become.",
    media: {
      type: "image",
      src: "/story/images/first-difficult-months.jpg",
      alt: "A difficult early gym training session",
      caption: "The beginning was not glamorous, but it was necessary.",
      objectPosition: "center",
    },
    alignment: "left",
    theme: "crimson",
  },

  {
    id: "discipline-over-motivation",
    chapterNumber: "06",
    eyebrow: "DISCIPLINE OVER MOTIVATION",
    title: "Motivation Started the Work. Discipline Protected It.",
    paragraphs: [
      "Motivation disappeared whenever I was tired, disappointed or unable to see immediate progress.",
      "Discipline taught me to train without excitement, prepare meals without applause and continue when nobody was watching.",
      "Confidence was not something I found before beginning. It was created every time I kept a promise to myself.",
    ],
    quote:
      "Discipline is what remained when motivation had nothing left to say.",
    media: {
      type: "image",
      src: "/story/images/discipline-over-motivation.jpg",
      alt: "A focused athlete training alone in a gym",
      caption: "The work continued even when motivation did not.",
      objectPosition: "center",
    },
    alignment: "right",
    theme: "steel",
  },

  {
    id: "reaching-68-kilograms",
    chapterNumber: "07",
    eyebrow: "REACHING 68 KILOGRAMS",
    title: "The Scale Showed a Number. My Life Showed More.",
    paragraphs: [
      "After eight months, I reached 68 kilograms. Twenty kilograms were gone, but the transformation could not be explained by subtraction alone.",
      "I gained courage, patience, self-respect and proof that difficult change was possible.",
      "Reaching 68 kilograms was not the ending. It was evidence that I could rebuild myself.",
    ],
    quote:
      "The scale measured what I lost. It could never measure everything I gained.",
    media: {
      type: "image",
      src: "/story/images/reaching-68kg.jpg",
      alt: "An after-transformation fitness portrait at 68 kilograms",
      caption: "68 kg after eight months of transformation.",
      objectPosition: "center 25%",
    },
    alignment: "left",
    theme: "gold",
  },

  {
    id: "building-muscle-and-confidence",
    chapterNumber: "08",
    eyebrow: "BUILDING MUSCLE AND CONFIDENCE",
    title: "Losing Weight Was the Beginning of Building Myself",
    paragraphs: [
      "Once the weight-loss phase ended, I continued learning how to build muscle, improve performance and train with greater purpose.",
      "The gym became more than a place where I changed my appearance. It became a place where effort was honest and progress had to be earned.",
      "I once trained because I disliked my body. I learned to train because I respected my future.",
    ],
    quote:
      "The gym did not ask who I used to be. It responded to what I was willing to do today.",
    media: {
      type: "image",
      src: "/story/images/building-muscle-confidence.jpg",
      alt: "A stronger and more confident physique developed through training",
      caption: "The next phase: strength, knowledge and confidence.",
      objectPosition: "center",
    },
    alignment: "right",
    theme: "steel",
  },

  {
    id: "why-i-created-muscle-fitness",
    chapterNumber: "09",
    eyebrow: "WHY I CREATED MUSCLE FITNESS",
    title: "I Built the Guidance I Needed When I Was Starting",
    paragraphs: [
      "I continued studying nutrition, exercise programming, anatomy, recovery, coaching psychology and sustainable habits.",
      "Muscle Fitness was created to help beginners feel guided instead of judged and to give people a clearer path through training, nutrition and progress.",
      "This platform was not created from perfection. It was created from pain, experience, education and purpose.",
    ],
    quote:
      "Pain became discipline. Discipline became knowledge. Knowledge became purpose.",
    media: {
      type: "image",
      src: "/story/images/why-muscle-fitness.jpg",
      alt: "A Muscle Fitness coaching dashboard and planning interface",
      caption: "Turning personal experience into a platform for others.",
      objectPosition: "center",
    },
    alignment: "left",
    theme: "gold",
  },

  {
    id: "a-message-to-the-reader",
    chapterNumber: "10",
    eyebrow: "A MESSAGE TO THE READER",
    title: "Your First Day Does Not Need to Be Perfect",
    paragraphs: [
      "You do not have to transform your entire life today. You only have to make one decision that your future self will be grateful you made.",
      "Your current condition is not a permanent identity. A difficult beginning does not decide the greatness of your ending.",
      "You will always wish you started sooner. But today is the youngest you will ever be.",
    ],
    quote:
      "I do not hate the person I used to be. He survived long enough to become the person building this future.",
    media: {
      type: "image",
      src: "/story/images/message-to-reader.jpg",
      alt: "A bright gym doorway representing a new beginning",
      caption: "Your first day can begin here.",
      objectPosition: "center",
    },
    alignment: "right",
    theme: "gold",
  },
];

export const fourDPillars = [
  {
    title: "Dedication",
    text: "I chose a future worth sacrificing for.",
  },
  {
    title: "Determination",
    text: "I continued when the mirror showed no immediate reward.",
  },
  {
    title: "Drive",
    text: "I remembered the pain that made me begin.",
  },
  {
    title: "Discipline",
    text: "I kept my promises when nobody was watching.",
  },
];