"use server";

import db from "@/lib/db";
import { requireUser } from "@/actions/shared";
import { evaluateEligibility, parseReviewedEvidence } from "@/lib/eligibility/evaluate";

export async function saveEligibilityEvidence(jobId: string, input: unknown) {
  try {
    const user = await requireUser();
    const parsed = parseReviewedEvidence(input);
    if (!parsed.success) return { success: false as const, message: "Invalid reviewed evidence." };
    const job = await db.job.findFirst({ where: { id: jobId, userId: user.id }, select: { id: true } });
    if (!job) return { success: false as const, message: "Job not found." };
    const evidence = JSON.stringify(parsed.data);
    await db.jobEligibilityEvidence.upsert({
      where: { jobId },
      create: { jobId, evidence },
      update: { evidence },
    });
    return { success: true as const, data: evaluateEligibility(parsed.data.job, parsed.data.candidate) };
  } catch {
    return { success: false as const, message: "Unable to save eligibility evidence." };
  }
}

export async function getEligibilityEvidence(jobId: string) {
  try {
    const user = await requireUser();
    const job = await db.job.findFirst({ where: { id: jobId, userId: user.id }, select: { id: true } });
    if (!job) return { success: false as const, message: "Job not found." };
    const row = await db.jobEligibilityEvidence.findUnique({ where: { jobId } });
    if (!row) return { success: true as const, data: null };
    const parsed = parseReviewedEvidence(JSON.parse(row.evidence));
    if (!parsed.success) return { success: false as const, message: "Stored evidence is invalid." };
    return { success: true as const, data: { evidence: parsed.data, result: evaluateEligibility(parsed.data.job, parsed.data.candidate) } };
  } catch {
    return { success: false as const, message: "Unable to read eligibility evidence." };
  }
}
