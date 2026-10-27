import { describe, expect, it } from "vitest";
import * as eligibility from "@/lib/eligibility/evaluate";

describe("reviewed eligibility evidence", () => {
  it("exposes a parser that refuses unreviewed input", () => {
    expect((eligibility as any).parseReviewedEvidence).toBeTypeOf("function");
    const parse = (eligibility as any).parseReviewedEvidence;
    expect(parse({ candidate: {}, job: {}, reviewed: false }).success).toBe(false);
  });

  it("accepts partial reviewed facts with source attribution", () => {
    const parse = (eligibility as any).parseReviewedEvidence;
    const result = parse({ reviewed: true, sourceUrl: "https://example.com/job", candidate: { homeState: "WA" }, job: { title: "Developer" } });
    expect(result.success).toBe(true);
    expect(result.data.job.citizenship).toBeUndefined();
  });

  it("rejects invalid enums, negative or nonfinite values, and malformed sources", () => {
    const parse = (eligibility as any).parseReviewedEvidence;
    for (const job of [{ clearance: "maybe" }, { softwareYears: -1 }, { annualSalaryMin: Infinity }]) {
      expect(parse({ reviewed: true, sourceUrl: "https://example.com/job", candidate: {}, job }).success).toBe(false);
    }
    expect(parse({ reviewed: true, sourceUrl: "javascript:alert(1)", candidate: {}, job: {} }).success).toBe(false);
  });
});
