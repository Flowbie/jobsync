import { describe, expect, it } from "vitest";

const loadEvaluator = () => import("@/lib/eligibility/evaluate");

const candidate = {
  citizenship: "US", clearance: "none", education: "associate",
  certifications: ["TEST-CERT"], homeState: "AK",
  relocationAreas: ["Example Metro"], remoteMinimum: 90000,
  targetMinimum: 150000, targetMaximum: 170000,
  serviceNowYears: 2, softwareYears: 4,
} as const;

const completeJob = {
  url: "https://example.com/job", title: "Platform Developer", status: "open",
  citizenship: "US", clearance: "none", education: "none", requiredCertifications: [],
  serviceNowYears: 2, softwareYears: 3, mode: "remote", eligibleStates: ["AK"],
  annualSalaryMin: 150000, annualSalaryMax: 170000,
} as const;

describe("eligibility decisions", () => {
  it("provides an evaluator for verified structured evidence", async () => {
    expect((await loadEvaluator())?.evaluateEligibility).toBeTypeOf("function");
  });
  it("marks a fully verified fit ready for human review and submission", async () => {
    const result = (await loadEvaluator())!.evaluateEligibility(completeJob, candidate);
    expect(result.decision).toBe("ready-to-apply");
    expect(result.submission).toBe("human-only");
  });
  it("treats absent information as manual review", async () => {
    const result = (await loadEvaluator())!.evaluateEligibility({ title: "Developer" }, candidate);
    expect(result.decision).toBe("manual-review");
    expect(result.unknowns.length).toBeGreaterThan(0);
  });
  it("flags remote-state exclusions, active clearance, and required certifications", async () => {
    const result = (await loadEvaluator())!.evaluateEligibility({ ...completeJob, eligibleStates: ["CA"], clearance: "active-secret", requiredCertifications: ["CAD"] }, candidate);
    expect(result.decision).toBe("do-not-apply");
    expect(result.blockers).toHaveLength(3);
  });
  it("does not reject preferred credentials or a public trust investigation", async () => {
    const result = (await loadEvaluator())!.evaluateEligibility({ ...completeJob, clearance: "obtainable", preferredCertifications: ["CAD"] }, candidate);
    expect(result.decision).toBe("manual-review");
    expect(result.blockers).toHaveLength(0);
  });
  it("treats degree equivalence and unknown experience as review", async () => {
    const result = (await loadEvaluator())!.evaluateEligibility({ ...completeJob, education: "bachelor", degreeEquivalency: "unknown", serviceNowYears: 4 }, { ...candidate, serviceNowYears: undefined });
    expect(result.decision).toBe("manual-review");
    expect(result.blockers).toHaveLength(0);
  });
  it("rejects non-Bay Area relocation and below-minimum remote compensation", async () => {
    const evaluate = (await loadEvaluator())!.evaluateEligibility;
    expect(evaluate({ ...completeJob, mode: "onsite", onsiteArea: "Seattle", outsideRelocationAreas: true }, candidate).decision).toBe("do-not-apply");
    expect(evaluate({ ...completeJob, annualSalaryMin: 70000, annualSalaryMax: 80000 }, candidate).decision).toBe("do-not-apply");
  });
  it("reviews on-site work in the candidate's home state without assuming the commute", async () => {
    const result = (await loadEvaluator())!.evaluateEligibility({ ...completeJob, mode: "onsite", workState: "AK", onsiteArea: "Example City" }, candidate);
    expect(result.decision).toBe("manual-review");
    expect(result.blockers).toHaveLength(0);
  });
  it("does not reject a California city merely because it is not the region name", async () => {
    const result = (await loadEvaluator())!.evaluateEligibility({ ...completeJob, mode: "hybrid", workState: "CA", onsiteArea: "San Jose" }, candidate);
    expect(result.decision).toBe("manual-review");
    expect(result.blockers).toHaveLength(0);
  });
  it("does not treat invalid compensation or generic US remote as verified", async () => {
    const result = (await loadEvaluator())!.evaluateEligibility({ ...completeJob, eligibleStates: undefined, annualSalaryMin: 140000, annualSalaryMax: 100000 }, candidate);
    expect(result.decision).toBe("manual-review");
    expect(result.unknowns.length).toBeGreaterThanOrEqual(2);
  });
  it("requires review when the candidate's pay preferences are missing", async () => {
    const result = (await loadEvaluator())!.evaluateEligibility(completeJob, { ...candidate, remoteMinimum: undefined });
    expect(result.decision).toBe("manual-review");
  });
});
