import type { AiAction, AiRun, CandidateProfile, InterviewRound, JobPosting, ResumeVersion, WorkspaceData } from "@/domain/types";
import type { CoachClientSnapshot } from "@/lib/jobdeck-ai/client-guard";

export interface CoachResponse<T = unknown> { status: "ready" | "needs_input" | "blocked" | "error"; result: T | null; missing_fields?: string[]; clarifying_questions?: string[]; warnings?: string[]; error?: { code: string; message: string }; meta?: { runId: string; workspaceId: string; requestId: string; action: AiAction; mode: "live"; provider: "deepseek"; modelCalled: boolean; attempts: number; promptVersion: string; basis: Record<string, unknown>; requiresHumanReview: true; configuredModel?: string; actualModel?: string | null; completionId?: string | null; usage?: Record<string, number> | null; startedAt: string; elapsedMs?: number; }; }

const randomId = () => typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `request-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const candidateText = (profile: CandidateProfile, masterResume: string) => [
  `姓名（仅用于上下文）：${profile.name}`,
  `求职方向：${profile.headline}`,
  `经验年限：${profile.yearsOfExperience}`,
  `教育：${profile.education.school}；${profile.education.major}；${profile.education.degree}`,
  `目标城市：${profile.preferences.cities.join("、") || "未填写"}`,
  `远程偏好：${profile.preferences.remoteAllowed ? "可考虑远程" : "不考虑远程"}`,
  `期望月薪：${profile.preferences.salaryMinK}-${profile.preferences.salaryMaxK}K/${profile.preferences.salaryPeriod}`,
  `技能：${profile.skills.join("、")}`,
  ...profile.facts.map((fact) => `事实 ${fact.id}：${fact.text}`),
  ...profile.modules?.map((module) => `档案模块 ${module.id}（${module.title}）：${module.content}`) ?? [],
  ...profile.gaps.map((gap) => `明确缺口：${gap}`),
  "基础简历：",
  masterResume,
].join("\n");
const jobText = (job: JobPosting) => [
  `职位：${job.title}`,
  `公司：${job.company}`,
  `地点：${job.city}`,
  `方向：${job.focus}`,
  `标签：${job.tags.join("、")}`,
  "岗位职责：",
  ...job.responsibilities.map((item) => `- ${item}`),
  "任职要求：",
  ...job.requirements.map((item) => `- ${item}`),
  job.jdText ? `补充 JD 原文：\n${job.jdText}` : "",
].filter(Boolean).join("\n");

export function makeCoachRequest(input: { action: AiAction; data: WorkspaceData; job: JobPosting; resume?: ResumeVersion | null; originalText?: string; question?: { id: string; text: string } | null; answer?: { revision: number; text: string } | null; instruction?: string; consent?: boolean }): CoachClientSnapshot {
  const requestId = randomId();
  return { action: input.action, workspaceId: input.data.fixtureId, requestId, jd: { id: input.job.id, revision: input.job.jdRevision ?? input.job.version ?? 1, text: jobText(input.job) }, candidate: { id: input.data.profile.id, revision: input.data.profile.version, text: candidateText(input.data.profile, input.data.masterResumeMarkdown) }, resume: input.resume ? { id: input.resume.id, revision: input.resume.number, text: input.resume.contentMarkdown } : null, originalText: input.originalText ?? "", question: input.question ?? null, answer: input.answer ?? null, instruction: input.instruction ?? "", consent: input.consent ?? true };
}

export async function requestCoach<T>(request: CoachClientSnapshot, signal?: AbortSignal): Promise<CoachResponse<T>> {
  const response = await fetch("/api/coach", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request), signal });
  const payload = await response.json() as CoachResponse<T>;
  if (!response.ok || payload.status === "error") throw new Error(payload.error?.message ?? "DeepSeek 请求失败；没有切换为 Mock 结果。");
  return payload;
}

export function aiRunFromResponse(response: CoachResponse, _request: CoachClientSnapshot, cardId: string): AiRun | null {
  if (!response.meta) return null;
  return { runId: response.meta.runId, requestId: response.meta.requestId, workspaceId: response.meta.workspaceId, cardId, action: response.meta.action, status: response.status === "ready" || response.status === "needs_input" || response.status === "blocked" ? response.status : "error", mode: "live", provider: "deepseek", promptVersion: response.meta.promptVersion, basis: response.meta.basis, configuredModel: response.meta.configuredModel, actualModel: response.meta.actualModel, completionId: response.meta.completionId, usage: response.meta.usage, modelCalled: response.meta.modelCalled, attempts: response.meta.attempts, validation: "schema_and_literal_quotes_only", semanticReview: "PENDING", result: response.result ?? undefined, errorMessage: response.warnings?.join("；") || response.clarifying_questions?.join("；"), startedAt: response.meta.startedAt, finishedAt: new Date().toISOString() };
}
