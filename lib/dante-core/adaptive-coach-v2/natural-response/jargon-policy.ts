export const INTERNAL_JARGON_PATTERNS: RegExp[] = [
  /\bACTIVE\b/g,
  /\bCONFOUNDED\b/g,
  /\bPROPOSED\b/g,
  /\bSUPPORTS\b/g,
  /\bDOES_NOT_SUPPORT\b/g,
  /\bConfidence Engine\b/gi,
  /\bRisk Accumulator\b/gi,
  /\bTool Authority\b/gi,
  /\bCurrent-State Precedence\b/gi,
  /\bProvenance Gate\b/gi,
  /\bcontrolledVariables\b/g,
  /\bvariableUnderTest\b/g,
];

export function containsInternalJargon(text: string): boolean {
  return INTERNAL_JARGON_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(text);
  });
}

export function scrubInternalJargon(text: string, language: "en" | "vi"): string {
  const replacements: Array<[RegExp, string, string]> = [
    [/\bACTIVE\b/g, "currently underway", "đang diễn ra"],
    [/\bCONFOUNDED\b/g, "too many factors changed at once", "có quá nhiều yếu tố thay đổi cùng lúc"],
    [/\bPROPOSED\b/g, "suggested but not started", "được đề xuất nhưng chưa bắt đầu"],
    [/\bSUPPORTS\b/g, "is consistent with", "phù hợp với"],
    [/\bDOES_NOT_SUPPORT\b/g, "does not appear consistent with", "có vẻ không phù hợp với"],
    [/\bConfidence Engine\b/gi, "available evidence", "bằng chứng hiện có"],
    [/\bRisk Accumulator\b/gi, "combined risk signals", "các tín hiệu rủi ro kết hợp"],
    [/\bTool Authority\b/gi, "permission to make that change", "quyền thực hiện thay đổi đó"],
    [/\bCurrent-State Precedence\b/gi, "your latest update", "cập nhật mới nhất của bạn"],
    [/\bProvenance Gate\b/gi, "evidence check", "kiểm tra nguồn bằng chứng"],
    [/\bcontrolledVariables\b/g, "things kept consistent", "những yếu tố được giữ ổn định"],
    [/\bvariableUnderTest\b/g, "the one thing being tested", "yếu tố duy nhất đang được thử nghiệm"],
  ];
  return replacements.reduce((result, [pattern, en, vi]) => result.replace(pattern, language === "vi" ? vi : en), text);
}
