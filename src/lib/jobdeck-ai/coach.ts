import { createHash, randomUUID } from "node:crypto";
import type { AiAction } from "@/domain/types";
import { CoachError } from "./errors";
import { missingInput, parseInput, splitSources, type CoachInput } from "./input";
import { completeJson, loadConfig } from "./deepseek";
import { buildMessages, PROMPT_VERSION } from "./prompts";
import { validateOutput } from "./output";
import { serverEnv } from "./runtime-config";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
export interface CoachMeta { runId: string; workspaceId: string; requestId: string; action: AiAction; mode: "live"; provider: "deepseek"; modelCalled: boolean; attempts: number; promptVersion: string; basis: Record<string, unknown>; startedAt: string; requiresHumanReview: true; elapsedMs?: number; configuredModel?: string; actualModel?: string | null; thinking?: string; completionId?: string | null; usage?: Record<string, number> | null; finishReason?: string; }
export interface CoachReply { status: "ready" | "needs_input" | "blocked"; result: unknown; missing_fields: string[]; clarifying_questions: string[]; warnings: string[]; meta: CoachMeta; }

export function inputBasis(input: CoachInput) {
  return { jdId: input.jd.id, jdRevision: input.jd.revision, jdHash: hash(input.jd.text), candidateId: input.candidate.id, candidateRevision: input.candidate.revision, candidateHash: hash(input.candidate.text), resumeRevision: input.resume?.revision ?? null, resumeHash: hash(input.resume?.text || ""), questionId: input.question?.id ?? null, questionHash: hash(input.question?.text || ""), answerRevision: input.answer?.revision ?? null, answerHash: hash(input.answer?.text || ""), instructionHash: hash(input.instruction), originalHash: hash(input.originalText) };
}

export async function runCoach(raw: unknown, options: { env?: NodeJS.ProcessEnv; signal?: AbortSignal } = {}): Promise<CoachReply> {
  const input = parseInput(raw); const started = Date.now();
  const meta: CoachMeta = { runId: randomUUID(), workspaceId: input.workspaceId, requestId: input.requestId, action: input.action, mode: "live", provider: "deepseek", modelCalled: false, attempts: 0, promptVersion: PROMPT_VERSION, basis: inputBasis(input), startedAt: new Date(started).toISOString(), requiresHumanReview: true };
  const missing = missingInput(input);
  if (missing.missing.length) return { status: "needs_input", result: null, missing_fields: missing.missing, clarifying_questions: missing.questions, warnings: [], meta: { ...meta, elapsedMs: Date.now() - started } };
  if (input.action === "rewrite_resume" && ![input.candidate.text, input.resume?.text || ""].some((value) => value.includes(input.originalText))) throw new CoachError("ORIGINAL_NOT_FOUND", "待修改原句不属于当前候选人材料或当前简历。");
  const sources = splitSources(input); const config = loadConfig(serverEnv(options.env)); const reply = await completeJson(config, buildMessages(input, sources), options.signal); const output = validateOutput(reply.result, input, sources);
  return { ...(output as Omit<CoachReply, "meta">), missing_fields: [], meta: { ...meta, modelCalled: true, attempts: 1, configuredModel: config.model, actualModel: reply.actualModel, thinking: config.thinking, completionId: reply.completionId, usage: reply.usage, finishReason: reply.finishReason, elapsedMs: Date.now() - started } } as CoachReply;
}
