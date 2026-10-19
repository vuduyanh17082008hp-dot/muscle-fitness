import { describe, expect, it } from "vitest";
import {
  buildSuggestedWorkoutChangeReply,
  classifyWorkoutMutationIntent,
  isWorkoutMutationRequest,
  needsTrainingCountClarification,
  proposalLanguage,
  readFrequencyIntent,
  resolveActionStatus,
} from "@/lib/dante-core/tools/action-response-guard";

type Row = {
  text: string;
  mutation: boolean;
  bucket: "direct" | "polite" | "question" | "hypothetical" | "ambiguous" | "vietnamese";
};

const ROWS: Row[] = [
  { bucket: "direct", mutation: true, text: "Set chest to 3 sessions weekly." },
  { bucket: "direct", mutation: true, text: "Change my chest frequency to 3x per week." },
  { bucket: "direct", mutation: true, text: "Update my program so chest is Monday Wednesday Friday." },
  { bucket: "direct", mutation: true, text: "Make chest 3x per week." },
  { bucket: "direct", mutation: true, text: "Increase chest frequency to 3 sessions." },
  { bucket: "direct", mutation: true, text: "Add another chest session." },
  { bucket: "direct", mutation: true, text: "Remove Friday chest." },
  { bucket: "direct", mutation: true, text: "Move chest from Friday to Saturday." },
  { bucket: "direct", mutation: true, text: "Switch my chest schedule to Monday Wednesday Friday." },
  { bucket: "direct", mutation: true, text: "đổi lịch ngực thành 3 buổi mỗi tuần" },
  { bucket: "direct", mutation: true, text: "tăng tần suất tập ngực lên 3 buổi" },
  { bucket: "direct", mutation: true, text: "thêm 1 buổi ngực vào lịch" },
  { bucket: "direct", mutation: true, text: "chuyển buổi ngực thứ Sáu sang thứ Bảy" },
  { bucket: "direct", mutation: true, text: "bỏ buổi ngực thứ Sáu" },
  { bucket: "direct", mutation: true, text: "Đổi workout chest cho tôi" },
  { bucket: "direct", mutation: true, text: "Decrease chest to 2 sessions." },
  { bucket: "direct", mutation: true, text: "Adjust my chest plan to 3x per week." },
  { bucket: "direct", mutation: true, text: "Reschedule chest to Saturday." },
  { bucket: "direct", mutation: true, text: "Replace Friday chest with Saturday." },
  { bucket: "direct", mutation: true, text: "Schedule chest on Monday." },
  { bucket: "direct", mutation: true, text: "Please increase chest to 3x." },

  { bucket: "polite", mutation: true, text: "Can you set chest to 3x per week?" },
  { bucket: "polite", mutation: true, text: "Could you move Friday chest to Saturday?" },
  { bucket: "polite", mutation: true, text: "Would you change my chest frequency to 3 days?" },
  { bucket: "polite", mutation: true, text: "Can you add another chest day?" },
  { bucket: "polite", mutation: true, text: "Could you remove Friday chest?" },
  { bucket: "polite", mutation: true, text: "Can you make my plan 4 days?" },
  { bucket: "polite", mutation: true, text: "Could you increase chest to 3 sessions?" },
  { bucket: "polite", mutation: true, text: "Can you decrease chest to 2x?" },
  { bucket: "polite", mutation: true, text: "Would you switch my chest to Monday Wednesday Friday?" },
  { bucket: "polite", mutation: true, text: "Can you adjust my chest plan to 3x per week?" },
  { bucket: "polite", mutation: true, text: "Could you reschedule Friday chest to Saturday?" },
  { bucket: "polite", mutation: true, text: "Can you please set chest to 3x?" },
  { bucket: "polite", mutation: true, text: "Could you schedule chest on Monday?" },
  { bucket: "polite", mutation: true, text: "Would you make chest 3x per week?" },
  { bucket: "polite", mutation: true, text: "Can you replace Friday chest with Saturday?" },

  { bucket: "question", mutation: false, text: "How often should I train chest?" },
  { bucket: "question", mutation: false, text: "What about chest frequency?" },
  { bucket: "question", mutation: false, text: "Would 3x chest be better?" },
  { bucket: "question", mutation: false, text: "Should I increase chest frequency?" },
  { bucket: "question", mutation: false, text: "Should I set chest to 3x?" },
  { bucket: "question", mutation: false, text: "Could 3x chest improve hypertrophy?" },
  { bucket: "question", mutation: false, text: "Can chest be trained 3x?" },
  { bucket: "question", mutation: false, text: "Would changing chest to 3 days help?" },
  { bucket: "question", mutation: false, text: "Can you explain chest frequency?" },
  { bucket: "question", mutation: false, text: "Could you compare 2x and 3x chest?" },
  { bucket: "question", mutation: false, text: "Would you recommend changing my split?" },
  { bucket: "question", mutation: false, text: "Should I move Friday chest to Saturday?" },
  { bucket: "question", mutation: false, text: "Would increasing frequency help?" },
  { bucket: "question", mutation: false, text: "Could adding Friday improve growth?" },
  { bucket: "question", mutation: false, text: "What do you think about adding another chest day?" },
  { bucket: "question", mutation: false, text: "what does set frequency mean?" },
  { bucket: "question", mutation: false, text: "would more chest frequency help?" },
  { bucket: "question", mutation: false, text: "How should I structure push day?" },
  { bucket: "question", mutation: false, text: "Is it better to switch from 2x to 3x?" },
  { bucket: "question", mutation: false, text: "Compare 2x vs 3x chest." },
  { bucket: "question", mutation: false, text: "Would changing chest to 3x help?" },
  { bucket: "question", mutation: false, text: "Change the program or just the session?" },
  { bucket: "question", mutation: false, text: "start today's workout" },
  { bucket: "question", mutation: false, text: "add 150g chicken to lunch" },

  { bucket: "hypothetical", mutation: false, text: "If I trained chest three times, what would happen?" },
  { bucket: "hypothetical", mutation: false, text: "nếu tập ngực 3 buổi thì sao" },
  { bucket: "hypothetical", mutation: false, text: "nếu tăng ngực lên 3 buổi thì sao?" },
  { bucket: "hypothetical", mutation: false, text: "What happens if I add another chest day?" },
  { bucket: "hypothetical", mutation: false, text: "Nếu đổi lịch ngực thành 3 buổi thì sao?" },
  { bucket: "hypothetical", mutation: false, text: "If I moved Friday chest to Saturday, what would happen?" },
  { bucket: "hypothetical", mutation: false, text: "What if I set chest to 3x?" },
  { bucket: "hypothetical", mutation: false, text: "What would happen if I added another chest day?" },
  { bucket: "hypothetical", mutation: false, text: "Nếu bỏ buổi ngực thứ Sáu thì sao?" },
  { bucket: "hypothetical", mutation: false, text: "If I increased chest frequency, would I grow faster?" },
  { bucket: "hypothetical", mutation: false, text: "What happens if I remove Friday chest?" },
  { bucket: "hypothetical", mutation: false, text: "nếu thêm 1 buổi ngực thì sao" },
  { bucket: "hypothetical", mutation: false, text: "Suppose I switch chest to 3x, what changes?" },
  { bucket: "hypothetical", mutation: false, text: "Gia sử đổi lịch ngực thành 3 buổi thì sao?" },
  { bucket: "hypothetical", mutation: false, text: "neu tang nguc len 3 buoi thi sao" },

  { bucket: "ambiguous", mutation: false, text: "more chest?" },
  { bucket: "ambiguous", mutation: false, text: "3x chest" },
  { bucket: "ambiguous", mutation: false, text: "maybe add Friday" },
  { bucket: "ambiguous", mutation: false, text: "đổi lịch?" },
  { bucket: "ambiguous", mutation: false, text: "chỉnh ngực" },
  { bucket: "ambiguous", mutation: false, text: "chest?" },
  { bucket: "ambiguous", mutation: false, text: "3 buổi ngực" },
  { bucket: "ambiguous", mutation: false, text: "ngực 3x" },
  { bucket: "ambiguous", mutation: false, text: "change?" },
  { bucket: "ambiguous", mutation: false, text: "maybe Friday chest" },

  { bucket: "vietnamese", mutation: true, text: "Bạn có thể đổi lịch ngực thành 3 buổi không?" },
  { bucket: "vietnamese", mutation: true, text: "Bạn chuyển buổi ngực thứ Sáu sang thứ Bảy giúp tôi nhé" },
  { bucket: "vietnamese", mutation: true, text: "Cho tôi thêm một buổi ngực" },
  { bucket: "vietnamese", mutation: true, text: "Giúp tôi đổi lịch ngực thành thứ Hai, Tư, Sáu" },
  { bucket: "vietnamese", mutation: true, text: "Bạn bỏ buổi ngực thứ Sáu giúp tôi" },
  { bucket: "vietnamese", mutation: true, text: "Set ngực to 3 buổi mỗi tuần." },
  { bucket: "vietnamese", mutation: true, text: "change lich nguc thanh 3 buoi" },
  { bucket: "vietnamese", mutation: true, text: "doi lich nguc thanh 3 buoi moi tuan" },
  { bucket: "vietnamese", mutation: true, text: "tang tan suat tap nguc len 3 buoi" },
  { bucket: "vietnamese", mutation: true, text: "sua workout chest cho toi" },
  { bucket: "vietnamese", mutation: true, text: "Tôi muốn đổi lịch ngực thành 3 buổi." },
  { bucket: "vietnamese", mutation: false, text: "Tôi có nên đổi lịch ngực không?" },
  { bucket: "vietnamese", mutation: false, text: "Tập ngực 3 buổi có tốt hơn không?" },
  { bucket: "vietnamese", mutation: false, text: "Bạn giải thích 3x frequency là gì?" },
  { bucket: "vietnamese", mutation: false, text: "còn tần suất tập ngực thì sao" },
  { bucket: "vietnamese", mutation: false, text: "có nên tăng tần suất ngực không" },
  { bucket: "vietnamese", mutation: false, text: "so sánh 2 buổi với 3 buổi" },
  { bucket: "vietnamese", mutation: false, text: "tăng volume có tốt không" },
  { bucket: "vietnamese", mutation: false, text: "set volume có nghĩa là gì?" },
  { bucket: "vietnamese", mutation: false, text: "con tan suat tap nguc thi sao" },

  { bucket: "polite", mutation: true, text: "Can you decrease leg frequency to once weekly?" },
  { bucket: "polite", mutation: true, text: "Could you set legs to once per week?" },
  { bucket: "polite", mutation: true, text: "Would you drop chest to one time per week?" },
  { bucket: "direct", mutation: true, text: "Set legs to 1 time a week." },
  { bucket: "direct", mutation: true, text: "Set chest to 1x weekly." },
  { bucket: "direct", mutation: true, text: "Set legs to 1x/week." },
  { bucket: "direct", mutation: true, text: "Set legs to 1 day per week." },
  { bucket: "direct", mutation: true, text: "Set chest to twice weekly." },
  { bucket: "direct", mutation: true, text: "Set chest to twice per week." },
  { bucket: "direct", mutation: true, text: "Set back to two times per week." },
  { bucket: "direct", mutation: true, text: "Set back to 2x/week." },
  { bucket: "direct", mutation: true, text: "Set back to 2 days per week." },
  { bucket: "direct", mutation: true, text: "Set chest to three times weekly." },
  { bucket: "direct", mutation: true, text: "Set chest to three times per week." },
  { bucket: "direct", mutation: true, text: "Set legs to 3 days per week." },
  { bucket: "vietnamese", mutation: true, text: "Đặt chân thành 1 buổi mỗi tuần." },
  { bucket: "vietnamese", mutation: true, text: "Đặt chân thành một buổi mỗi tuần." },
  { bucket: "vietnamese", mutation: true, text: "Đặt chân thành 1 buổi/tuần." },
  { bucket: "vietnamese", mutation: true, text: "Đặt ngực thành 2 buổi mỗi tuần." },
  { bucket: "vietnamese", mutation: true, text: "Đặt ngực thành hai buổi mỗi tuần." },
  { bucket: "vietnamese", mutation: true, text: "Đặt ngực thành 3 buổi/tuần." },
  { bucket: "vietnamese", mutation: true, text: "Đặt chân thành ba buổi mỗi tuần." },
  { bucket: "polite", mutation: true, text: "Bạn có thể giảm tần suất chân xuống một buổi mỗi tuần không?" },
  { bucket: "question", mutation: false, text: "Is once weekly enough for legs?" },
  { bucket: "question", mutation: false, text: "Would training legs once weekly work?" },
  { bucket: "question", mutation: false, text: "Can legs grow training once per week?" },
  { bucket: "question", mutation: false, text: "Should I decrease legs to once weekly?" },
  { bucket: "hypothetical", mutation: false, text: "If I trained legs once weekly, what would happen?" },
  { bucket: "question", mutation: false, text: "Explain once-weekly leg training." },
  { bucket: "vietnamese", mutation: false, text: "Tập chân một buổi mỗi tuần có đủ không?" },
  { bucket: "vietnamese", mutation: false, text: "Tôi có nên giảm chân xuống một buổi không?" },
  { bucket: "vietnamese", mutation: false, text: "Nếu tập chân một buổi mỗi tuần thì sao?" },
  { bucket: "ambiguous", mutation: false, text: "Would 3x chest be better?" },
  { bucket: "question", mutation: false, text: "3x10 bench press?" },
  { bucket: "direct", mutation: true, text: "Set chest to 3x per week." },
  { bucket: "direct", mutation: true, text: "Train is not the verb. Set chest 3x weekly." },
];

describe("workout mutation intent matrix", () => {
  it("keeps explicit directives and only those", () => {
    const misses: string[] = [];
    let tp = 0;
    let tn = 0;
    let fp = 0;
    let fn = 0;
    for (const row of ROWS) {
      const got = isWorkoutMutationRequest(row.text);
      if (row.mutation && got) tp += 1;
      else if (!row.mutation && !got) tn += 1;
      else if (got) {
        fp += 1;
        misses.push(`FP ${row.bucket}: ${row.text}`);
      } else {
        fn += 1;
        misses.push(`FN ${row.bucket}: ${row.text}`);
      }
    }
    const buckets = {
      direct: ROWS.filter((row) => row.bucket === "direct").length,
      polite: ROWS.filter((row) => row.bucket === "polite").length,
      question: ROWS.filter((row) => row.bucket === "question").length,
      hypothetical: ROWS.filter((row) => row.bucket === "hypothetical").length,
      ambiguous: ROWS.filter((row) => row.bucket === "ambiguous").length,
      vietnamese: ROWS.filter((row) => row.bucket === "vietnamese").length,
    };
    expect(misses, misses.join("\n")).toEqual([]);
    expect(buckets.direct).toBeGreaterThanOrEqual(20);
    expect(buckets.polite).toBeGreaterThanOrEqual(15);
    expect(buckets.question).toBeGreaterThanOrEqual(20);
    expect(buckets.hypothetical).toBeGreaterThanOrEqual(15);
    expect(buckets.ambiguous).toBeGreaterThanOrEqual(10);
    expect(buckets.vietnamese).toBeGreaterThanOrEqual(15);
    expect(ROWS.length).toBeGreaterThanOrEqual(130);
    expect({ tp, tn, fp, fn, total: ROWS.length }).toEqual({
      tp,
      tn,
      fp: 0,
      fn: 0,
      total: ROWS.length,
    });
  });

  it("does not treat sua as a substring of suat", () => {
    expect(isWorkoutMutationRequest("còn tần suất tập ngực thì sao")).toBe(false);
    expect(isWorkoutMutationRequest("con tan suat tap nguc thi sao")).toBe(false);
    expect(classifyWorkoutMutationIntent("tăng tần suất tập ngực lên 3 buổi")).toBe("EXPLICIT_MUTATION");
  });

  it("classifies discussion, advice, and hypotheticals away from mutation", () => {
    expect(classifyWorkoutMutationIntent("What about chest frequency?")).toBe("INFORMATIONAL_DISCUSSION");
    expect(classifyWorkoutMutationIntent("Should I increase chest frequency?")).toBe("RECOMMENDATION_REQUEST");
    expect(classifyWorkoutMutationIntent("nếu tăng ngực lên 3 buổi thì sao?")).toBe("SIMULATION");
    expect(classifyWorkoutMutationIntent("chỉnh ngực")).toBe("PROPOSED_CHANGE");
    expect(classifyWorkoutMutationIntent("3x chest")).toBe("PROPOSED_CHANGE");
    expect(classifyWorkoutMutationIntent("Set chest to 3 sessions weekly.")).toBe("EXPLICIT_MUTATION");
    expect(classifyWorkoutMutationIntent("Can you set chest to 3x per week?")).toBe("EXPLICIT_MUTATION");
    expect(classifyWorkoutMutationIntent("Would you change my chest frequency to 3 days?")).toBe("EXPLICIT_MUTATION");
    expect(classifyWorkoutMutationIntent("Would changing my chest frequency to 3 days help?")).toBe("RECOMMENDATION_REQUEST");
    expect(classifyWorkoutMutationIntent("Should I set chest to 3x?")).toBe("RECOMMENDATION_REQUEST");
    expect(classifyWorkoutMutationIntent("Bạn có thể đổi lịch ngực thành 3 buổi không?")).toBe("EXPLICIT_MUTATION");
  });

  it("proposes Set chest to 3x and does not treat the proposal as a write", () => {
    expect(classifyWorkoutMutationIntent("Set chest to 3x")).toBe("EXPLICIT_MUTATION");
    const reply = buildSuggestedWorkoutChangeReply("en", "Set chest to 3x");
    expect(reply).toMatch(/Set chest to 3x/);
    expect(reply).toMatch(/only a proposed change|haven't changed your saved program/i);
    expect(reply).not.toMatch(/requires your explicit confirmation|confirm now to save/i);
    expect(reply).not.toMatch(/I updated|I changed|have saved/i);
    expect(resolveActionStatus({ pendingConfirmation: null })).toBe("SUGGESTED");
    expect(resolveActionStatus({ pendingConfirmation: { actionId: "a" } })).toBe("PENDING_CONFIRMATION");
    expect(resolveActionStatus({ pendingConfirmation: null, executedWrite: true })).toBe("EXECUTED");
    const vi = buildSuggestedWorkoutChangeReply("vi", "Giảm chân");
    expect(vi).toMatch(/đề xuất thay đổi/);
    expect(vi).toMatch(/chưa thay đổi/);
    expect(vi).not.toMatch(/xác nhận/);
    expect(proposalLanguage("Bạn có thể giảm tần suất chân xuống một buổi mỗi tuần không?", "en")).toBe("vi");
    expect(readFrequencyIntent("once weekly")).toEqual({ count: 1, period: "week" });
    expect(readFrequencyIntent("3 buổi/tuần")).toEqual({ count: 3, period: "week" });
    expect(readFrequencyIntent("3x10 bench press")).toBeNull();
    expect(needsTrainingCountClarification("Would 3x chest be better?")).toBe(true);
    expect(needsTrainingCountClarification("3x chest per week")).toBe(false);
    expect(needsTrainingCountClarification("train chest 3x weekly")).toBe(false);
    expect(needsTrainingCountClarification("3x10 bench press")).toBe(false);
  });
});
