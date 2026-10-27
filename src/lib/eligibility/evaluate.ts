import { z } from "zod";

/** Inputs must come from reviewed evidence, not inference from free-form postings. */
export interface CandidateEvidence {
  citizenship?: string;
  clearance?: "none" | "active-secret" | "active-top-secret";
  education?: "associate" | "bachelor";
  certifications?: readonly string[];
  homeState?: string;
  relocationAreas?: readonly string[];
  remoteMinimum?: number;
  targetMinimum?: number;
  targetMaximum?: number;
  serviceNowYears?: number;
  softwareYears?: number;
}

export interface JobRequirements {
  title?: string;
  url?: string;
  status?: "open" | "closed";
  citizenship?: "US" | "none";
  clearance?: "none" | "obtainable" | "active-secret" | "active-top-secret";
  education?: "none" | "associate" | "bachelor";
  degreeEquivalency?: "accepted" | "not-accepted" | "unknown";
  requiredCertifications?: readonly string[];
  preferredCertifications?: readonly string[];
  serviceNowYears?: number;
  softwareYears?: number;
  mode?: "remote" | "hybrid" | "onsite";
  eligibleStates?: readonly string[];
  workState?: string;
  onsiteArea?: string;
  /** Explicitly reviewed against the candidate's allowed relocation areas. */
  outsideRelocationAreas?: boolean;
  annualSalaryMin?: number;
  annualSalaryMax?: number;
}

export interface EligibilityResult {
  decision: "ready-to-apply" | "manual-review" | "do-not-apply";
  blockers: string[];
  unknowns: string[];
  positives: string[];
  submission: "human-only";
}

const validNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

const nonnegative = z.number().finite().nonnegative();
const text = z.string().trim().min(1).max(200);
const states = z.array(z.string().regex(/^[A-Z]{2}$/)).max(50);
const evidenceSchema = z.object({
  reviewed: z.literal(true),
  sourceUrl: z.url().refine((url) => /^https?:\/\//i.test(url), "Source must use HTTP or HTTPS"),
  candidate: z.strictObject({
    citizenship: text.optional(), clearance: z.enum(["none", "active-secret", "active-top-secret"]).optional(),
    education: z.enum(["associate", "bachelor"]).optional(), certifications: z.array(text).max(100).optional(),
    homeState: z.string().regex(/^[A-Z]{2}$/).optional(), relocationAreas: z.array(text).max(100).optional(),
    remoteMinimum: nonnegative.optional(), targetMinimum: nonnegative.optional(), targetMaximum: nonnegative.optional(),
    serviceNowYears: nonnegative.optional(), softwareYears: nonnegative.optional(),
  }),
  job: z.strictObject({
    title: text.optional(), url: z.url().refine((url) => /^https?:\/\//i.test(url)).optional(),
    status: z.enum(["open", "closed"]).optional(), citizenship: z.enum(["US", "none"]).optional(),
    clearance: z.enum(["none", "obtainable", "active-secret", "active-top-secret"]).optional(),
    education: z.enum(["none", "associate", "bachelor"]).optional(),
    degreeEquivalency: z.enum(["accepted", "not-accepted", "unknown"]).optional(),
    requiredCertifications: z.array(text).max(100).optional(), preferredCertifications: z.array(text).max(100).optional(),
    serviceNowYears: nonnegative.optional(), softwareYears: nonnegative.optional(),
    mode: z.enum(["remote", "hybrid", "onsite"]).optional(), eligibleStates: states.optional(),
    workState: z.string().regex(/^[A-Z]{2}$/).optional(), onsiteArea: text.optional(),
    outsideRelocationAreas: z.boolean().optional(), annualSalaryMin: nonnegative.optional(), annualSalaryMax: nonnegative.optional(),
  }),
}).strict();

export function parseReviewedEvidence(input: unknown) {
  return evidenceSchema.safeParse(input);
}

export function evaluateEligibility(job: JobRequirements, candidate: CandidateEvidence): EligibilityResult {
  const blockers: string[] = [];
  const unknowns: string[] = [];
  const positives: string[] = [];
  if (!job.title || !job.url) unknowns.push("Verify the job title and original posting URL.");
  if (job.status === "closed") blockers.push("The posting is closed.");
  else if (job.status !== "open") unknowns.push("Confirm the posting is accepting applications.");

  if (!job.citizenship || !candidate.citizenship) unknowns.push("Confirm work authorization requirements and candidate status.");
  else if (job.citizenship === "US" && candidate.citizenship !== "US") blockers.push("US citizenship is required.");

  if (!job.clearance || !candidate.clearance) unknowns.push("Confirm clearance requirements and candidate status.");
  else if (job.clearance === "obtainable") unknowns.push("Confirm suitability to obtain the required clearance or public trust.");
  else if (job.clearance === "active-secret" && candidate.clearance === "none" || job.clearance === "active-top-secret" && candidate.clearance !== "active-top-secret") blockers.push("An active clearance is required.");

  if (!job.education || !candidate.education) unknowns.push("Confirm education requirements and candidate qualifications.");
  else if (job.education === "bachelor" && candidate.education !== "bachelor") {
    if (job.degreeEquivalency === "not-accepted") blockers.push("A bachelor's degree is required without equivalency.");
    else unknowns.push("Confirm whether equivalent experience satisfies the degree requirement.");
  }

  if (!job.requiredCertifications || !candidate.certifications) unknowns.push("Confirm required certifications and credentials held.");
  else for (const cert of job.requiredCertifications) {
    if (!candidate.certifications.some((held) => held.trim().toLowerCase() === cert.trim().toLowerCase())) blockers.push(`Required certification not listed: ${cert}.`);
  }

  for (const [label, required, held] of [["ServiceNow", job.serviceNowYears, candidate.serviceNowYears], ["software development", job.softwareYears, candidate.softwareYears]] as const) {
    if (!validNumber(required)) unknowns.push(`Confirm ${label} experience requirement.`);
    else if (required > 0 && !validNumber(held)) unknowns.push(`Verify candidate's ${label} experience.`);
    else if (required > 0 && validNumber(held) && held < required) unknowns.push(`Review the ${required}+ years of ${label} experience requirement.`);
  }

  if (job.mode === "remote") {
    if (!candidate.homeState || !job.eligibleStates?.length) unknowns.push("Confirm whether remote work is permitted from the candidate's state.");
    else if (!job.eligibleStates.some((state) => state.toUpperCase() === candidate.homeState!.toUpperCase())) blockers.push("Remote work excludes the candidate's state.");
  } else if (job.mode === "hybrid" || job.mode === "onsite") {
    if (job.workState && candidate.homeState && job.workState.toUpperCase() === candidate.homeState.toUpperCase()) unknowns.push("Confirm commute and local work location.");
    else if (!job.onsiteArea || !candidate.relocationAreas) unknowns.push("Confirm the work location and relocation preference.");
    else if (job.outsideRelocationAreas === true) blockers.push("Work location is outside the accepted relocation area.");
    else if (!candidate.relocationAreas.some((area) => area.toLowerCase() === job.onsiteArea!.toLowerCase())) unknowns.push("Verify the location against the accepted relocation area.");
  } else unknowns.push("Confirm the work arrangement.");

  if (!validNumber(job.annualSalaryMin) || !validNumber(job.annualSalaryMax) || job.annualSalaryMax < job.annualSalaryMin) unknowns.push("Confirm annual base compensation.");
  else {
    if (job.mode === "remote" && !validNumber(candidate.remoteMinimum)) unknowns.push("Confirm the minimum acceptable remote salary.");
    if (job.mode === "remote" && validNumber(candidate.remoteMinimum) && job.annualSalaryMax < candidate.remoteMinimum) blockers.push("Remote salary ceiling is below the minimum.");
    if (validNumber(candidate.targetMinimum) && validNumber(candidate.targetMaximum) && job.annualSalaryMax >= candidate.targetMinimum && job.annualSalaryMin <= candidate.targetMaximum) positives.push("Published salary overlaps the target range; an offer is not guaranteed.");
    else unknowns.push("Review whether the compensation meets the target.");
  }
  return { decision: blockers.length ? "do-not-apply" : unknowns.length ? "manual-review" : "ready-to-apply", blockers, unknowns, positives, submission: "human-only" };
}
