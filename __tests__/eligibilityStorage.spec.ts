import { beforeEach, describe, expect, it, vi } from "vitest";

const jobFind = vi.hoisted(() => vi.fn());
const save = vi.hoisted(() => vi.fn());
const findEvidence = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({ default: { job: { findFirst: jobFind }, jobEligibilityEvidence: { upsert: save, findUnique: findEvidence } } }));
vi.mock("@/actions/shared", () => ({ requireUser: async () => ({ id: "owner" }) }));

const input = { reviewed: true, sourceUrl: "https://example.com/job", candidate: {}, job: {} };
const loadActions = async () => {
  try {
    const path = "../src/actions/eligibility.actions.ts";
    return await import(/* @vite-ignore */ path);
  } catch { return null; }
};

describe("eligibility storage", () => {
  beforeEach(() => { vi.clearAllMocks(); jobFind.mockResolvedValue({ id: "job-1" }); save.mockResolvedValue({ id: "evidence-1" }); });
  it("provides a save action for owned jobs", async () => {
    expect((await loadActions())?.saveEligibilityEvidence).toBeTypeOf("function");
  });
  it("rejects invalid evidence before saving", async () => {
    const result = await (await loadActions())!.saveEligibilityEvidence("job-1", { ...input, reviewed: false });
    expect(result.success).toBe(false);
    expect(save).not.toHaveBeenCalled();
  });
  it("never writes evidence to another user's job", async () => {
    jobFind.mockResolvedValue(null);
    const result = await (await loadActions())!.saveEligibilityEvidence("job-2", input);
    expect(result.success).toBe(false);
    expect(jobFind).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "job-2", userId: "owner" } }));
    expect(save).not.toHaveBeenCalled();
  });
  it("stores validated evidence separately from matching data", async () => {
    const result = await (await loadActions())!.saveEligibilityEvidence("job-1", input);
    expect(result.success).toBe(true);
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ where: { jobId: "job-1" } }));
  });
  it("reads only evidence belonging to an owned job", async () => {
    jobFind.mockResolvedValue(null);
    const result = await (await loadActions())!.getEligibilityEvidence("job-2");
    expect(result.success).toBe(false);
    expect(findEvidence).not.toHaveBeenCalled();
  });
  it("reloads and re-evaluates valid saved facts", async () => {
    findEvidence.mockResolvedValue({ evidence: JSON.stringify(input) });
    const result = await (await loadActions())!.getEligibilityEvidence("job-1");
    expect(result.success).toBe(true);
    expect(result.data?.result.decision).toBe("manual-review");
  });
  it("does not evaluate invalid saved facts", async () => {
    findEvidence.mockResolvedValue({ evidence: '{"reviewed":false}' });
    const result = await (await loadActions())!.getEligibilityEvidence("job-1");
    expect(result.success).toBe(false);
  });
});
