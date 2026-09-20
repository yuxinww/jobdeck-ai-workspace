import { CoachError } from "./errors";
import type { AiAction } from "@/domain/types";

export const ACTIONS: AiAction[] = ["analyze_job", "rewrite_resume", "prepare_interview", "review_answer"];

export interface CoachSource { id: string; revision: number; text: string; }
export interface CoachInput {
  action: AiAction;
  workspaceId: string;
  requestId: string;
  jd: CoachSource;
  candidate: CoachSource;
  resume: CoachSource | null;
  originalText: string;
  question: { id: string; text: string } | null;
  answer: { revision: number; text: string } | null;
  instruction: string;
  consent: boolean;
}

function object(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new CoachError("INVALID_INPUT", `${name} 必须为对象。`);
  return value as Record<string, unknown>;
}
function text(value: unknown, name: string, max = 24000): string {
  if (typeof value !== "string" || value.length > max) throw new CoachError("INVALID_INPUT", `${name} 必须是长度不超过 ${max} 的文本。`);
  return value;
}
function revision(value: unknown, name: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) throw new CoachError("INVALID_INPUT", `${name} 必须是正整数。`);
  return value as number;
}
function id(value: unknown, name: string): string {
  const valueText = text(value, name, 100);
  if (!/^[a-zA-Z0-9._-]+$/.test(valueText)) throw new CoachError("INVALID_INPUT", `${name} 格式无效。`);
  return valueText;
}
function source(value: unknown, name: string, max: number): CoachSource {
  const item = object(value, name);
  return { id: id(item.id, `${name}.id`), revision: revision(item.revision, `${name}.revision`), text: text(item.text, `${name}.text`, max) };
}

export function parseInput(raw: unknown): CoachInput {
  const request = object(raw, "request");
  const allowed = new Set(["action", "workspaceId", "requestId", "jd", "candidate", "resume", "originalText", "question", "answer", "instruction", "consent"]);
  if (Object.keys(request).some((key) => !allowed.has(key))) throw new CoachError("INVALID_INPUT", "请求含未定义字段；不能从前端覆盖模型或系统提示词。");
  if (!ACTIONS.includes(request.action as AiAction)) throw new CoachError("INVALID_ACTION", "不支持的 AI 动作。");
  if (typeof request.consent !== "boolean") throw new CoachError("INVALID_INPUT", "请明确 consent 是否同意向 DeepSeek 发送材料。");
  const question = request.question ? object(request.question, "question") : null;
  const answer = request.answer ? object(request.answer, "answer") : null;
  return {
    action: request.action as AiAction,
    workspaceId: id(request.workspaceId, "workspaceId"),
    requestId: id(request.requestId, "requestId"),
    jd: source(request.jd, "jd", 16000),
    candidate: source(request.candidate, "candidate", 24000),
    resume: request.resume ? source(request.resume, "resume", 16000) : null,
    originalText: text(request.originalText ?? "", "originalText", 6000),
    question: question ? { id: id(question.id, "question.id"), text: text(question.text, "question.text", 4000) } : null,
    answer: answer ? { revision: revision(answer.revision, "answer.revision"), text: text(answer.text, "answer.text", 8000) } : null,
    instruction: text(request.instruction ?? "", "instruction", 2000),
    consent: request.consent,
  };
}

export function missingInput(input: CoachInput) {
  const missing: string[] = [];
  if (!input.jd.text.trim()) missing.push("jd");
  if (!input.candidate.text.trim()) missing.push("candidate");
  if (input.action === "rewrite_resume" && !input.originalText.trim()) missing.push("originalText");
  if (input.action === "review_answer") {
    if (!input.question?.text.trim()) missing.push("question");
    if (!input.answer?.text.trim()) missing.push("answer");
  }
  if (!input.consent) missing.push("consent");
  const names: Record<string, string> = { jd: "当前岗位 JD", candidate: "候选人的简历或经历材料", originalText: "希望优化的原始段落", question: "当前面试题", answer: "你的实际回答", consent: "同意将当前材料发送到 DeepSeek" };
  return { missing, questions: missing.map((key) => `请补充或确认：${names[key]}。`) };
}

export function splitSources(input: CoachInput) {
  const make = (value: string, prefix: string) => value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line, index) => ({ id: `${prefix}${String(index + 1).padStart(3, "0")}`, text: line }));
  const sources = { jd: make(input.jd.text, "J"), candidate: make(input.candidate.text, "C") };
  if (sources.jd.length > 300 || sources.candidate.length > 400) throw new CoachError("INPUT_TOO_LARGE", "材料段落过多，请精简后再试。");
  return sources;
}
