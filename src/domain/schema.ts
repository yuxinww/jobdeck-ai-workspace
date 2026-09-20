import { z } from "zod";
import type { PersistedWorkspace, WorkspaceData } from "./types";

const persistedSchema = z.object({
  schemaVersion: z.literal(1),
  fixtureId: z.string(),
  revision: z.number().int().nonnegative(),
  savedAt: z.string(),
  domain: z.object({
    schemaVersion: z.literal(1),
    fixtureId: z.string(),
    isMock: z.literal(true),
    jobs: z.array(z.object({ id: z.string() }).passthrough()),
    cards: z.array(z.object({ id: z.string(), jobId: z.string(), resumeId: z.string() }).passthrough()),
    resumes: z.array(z.object({ id: z.string(), cardId: z.string() }).passthrough()),
  }).passthrough(),
});

export function parsePersistedWorkspace(value: unknown): PersistedWorkspace {
  return persistedSchema.parse(value) as unknown as PersistedWorkspace;
}

export function assertWorkspaceReferences(domain: WorkspaceData) {
  const jobIds = new Set(domain.jobs.map((job) => job.id));
  const cardIds = new Set(domain.cards.map((card) => card.id));
  const resumeIds = new Set(domain.resumes.map((resume) => resume.id));
  if (domain.cards.some((card) => !jobIds.has(card.jobId) || !resumeIds.has(card.resumeId))) throw new Error("岗位卡片存在无效岗位或简历引用");
  if (domain.resumes.some((resume) => !cardIds.has(resume.cardId))) throw new Error("岗位简历存在无效卡片引用");
  const evidenceIds = new Set(domain.profile.facts.map((fact) => fact.id));
  if (domain.resumeVersions.some((version) => version.evidenceIds.some((id) => !evidenceIds.has(id)))) throw new Error("简历版本存在无效证据引用");
  return true;
}
