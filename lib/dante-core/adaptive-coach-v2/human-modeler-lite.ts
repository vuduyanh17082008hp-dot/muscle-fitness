import { normalizeSafetyText } from "@/lib/dante-core/safety-layer";

export type HumanSessionSignals = {
  serious: boolean;
  joking: boolean;
  frustrated: boolean;
  concise: boolean;
  detailed: boolean;
  slang: number;
  profanityTarget: "SELF" | "DANTE" | "SITUATION" | "NONE";
  competenceBait: boolean;
  language: "en" | "vi" | "mixed";
};

export function modelHumanSessionSignals(text: string): HumanSessionSignals {
  const normalized = normalizeSafetyText(text);
  const vi = /\b(?:toi|tao|minh|khong|dau|vai|gio|nhung)\b/.test(normalized);
  const en = /\b(?:i|you|my|the|but|now|pain|workout)\b/.test(normalized);
  const profanity = /\b(?:fuck(?:ing)?|shit|damn|đm|dm|vcl)\b/i.test(text);
  const selfTarget = /\b(?:i(?:'m| am)|toi|minh|tao)\b.{0,24}\b(?:fuck(?:ing)?|stupid|idiot|ngu|vo dung)\b/i.test(normalized);
  const danteTarget = /\b(?:you|dante|may)\b.{0,24}\b(?:fuck(?:ing)?|stupid|idiot|ngu)\b/i.test(normalized);
  const joking = /(?:\blol\b|\bhaha+\b|😂|🤣|just kidding|dua thoi)/i.test(normalized);
  const frustrated = !joking && /(?:again|still wrong|listen|told you|buc|chan|sai roi|khong hieu)/i.test(normalized);
  const wordCount = normalized.split(/\s+/).filter(Boolean).length;

  return {
    serious: !joking && /(?:pain|dizzy|numb|safety|dau|chong mat|te bi|ngat)/i.test(normalized),
    joking,
    frustrated,
    concise: wordCount <= 12,
    detailed: wordCount >= 60,
    slang: [/\bbro\b/i, /\blol\b/i, /\bnah\b/i, /\bvl\b/i, /\bvcl\b/i].filter((pattern) => pattern.test(normalized)).length,
    profanityTarget: !profanity ? "NONE" : selfTarget ? "SELF" : danteTarget ? "DANTE" : "SITUATION",
    competenceBait: /(?:if you(?:'re| are) smart|prove you|real coach|biet gi|gioi thi)/i.test(normalized),
    language: vi && en ? "mixed" : vi ? "vi" : "en",
  };
}
