import { CoachError } from "./errors";
import type { AiAction } from "@/domain/types";
import type { CoachInput } from "./input";

const bad = (message: string): never => { throw new CoachError("OUTPUT_VALIDATION_FAILED", `AI 输出未通过检查：${message}`, 502); };
const object = (value: unknown, label: string): Record<string, unknown> => { if (!value || typeof value !== "object" || Array.isArray(value)) bad(`${label} 应为对象`); return value as Record<string, unknown>; };
const string = (value: unknown, label: string, empty = false): string => { if (typeof value !== "string" || (!empty && !value.trim())) bad(`${label} 应为文本`); return value as string; };
const array = (value: unknown, label: string, min = 0): unknown[] => { if (!Array.isArray(value) || value.length < min) bad(`${label} 数量不足或格式错误`); return value as unknown[]; };
const strings = (value: unknown, label: string) => array(value, label).forEach((item) => string(item, label));

export function validateOutput(raw: unknown, input: CoachInput, sources: { jd: { id: string; text: string }[]; candidate: { id: string; text: string }[] }) {
  const out = object(raw, "result");
  if (!["ready", "needs_input", "blocked"].includes(String(out.status))) bad("status");
  strings(out.clarifying_questions, "clarifying_questions"); strings(out.warnings, "warnings");
  if (out.status !== "ready") { if (out.result !== null) bad("非 ready 状态 result 必须为空"); if (!(out.clarifying_questions as unknown[]).length && !(out.warnings as unknown[]).length) bad("没有解释缺失或阻止原因"); return out; }
  const result = object(out.result, "result");
  const jd = new Map(sources.jd.map((source) => [source.id, source.text]));
  const candidate = new Map(sources.candidate.map((source) => [source.id, source.text]));
  const ref = (value: unknown, map: Map<string, string>, label: string) => { const item = object(value, label); const refId = string(item.id, `${label}.id`); const quote = string(item.quote, `${label}.quote`); const source = map.get(refId); if (!source || !source.includes(quote)) bad(`${label} 不是当前来源的有效原文`); };
  const refs = (value: unknown, map: Map<string, string>, label: string, min = 0) => array(value, label, min).forEach((item) => ref(item, map, label));
  const claims = (value: unknown, text: string, label: string, min = 0) => array(value, label, min).forEach((item) => { const claim = object(item, label); const claimText = string(claim.text, `${label}.text`); if (!text.includes(claimText)) bad(`${label} 不属于建议正文`); refs(claim.candidate_refs, candidate, `${label}.candidate_refs`, 1); });
  const unique = (items: unknown[]) => { const ids = items.map((item) => string(object(item, "item").id, "id")); if (new Set(ids).size !== ids.length) bad("ID 重复"); };
  const action = input.action as AiAction;
  if (action === "analyze_job") {
    const rows = array(result.requirements, "requirements", 1); unique(rows); rows.forEach((item) => { const row = object(item, "requirement"); ref(row.jd_ref, jd, "jd_ref"); if (!["must", "bonus", "unknown"].includes(String(row.level))) bad("level"); const relation = String(row.relation); if (!["supported", "partial", "unknown", "explicit_gap"].includes(relation)) bad("relation"); refs(row.candidate_refs, candidate, "candidate_refs", relation === "unknown" ? 0 : 1); string(row.explanation, "explanation"); string(row.follow_up, "follow_up", true); });
  } else if (action === "rewrite_resume") {
    const rows = array(result.suggestions, "suggestions", 1); rows.forEach((item) => { const row = object(item, "suggestion"); const original = string(row.original_quote, "original_quote"); string(row.proposed_text, "proposed_text"); string(row.why, "why"); if (!input.originalText.includes(original)) bad("original_quote 不属于请求原句"); refs(row.jd_refs, jd, "jd_refs", 1); claims(row.claims, String(row.proposed_text), "claims", 1); });
  } else if (action === "prepare_interview") {
    const rows = array(result.questions, "questions", 3); unique(rows); const texts = rows.map((item) => String(object(item, "question").text).trim()); if (new Set(texts).size !== rows.length) bad("问题重复"); rows.forEach((item) => { const row = object(item, "question"); string(row.text, "text"); string(row.rationale, "rationale"); refs(row.jd_refs, jd, "jd_refs", 1); const basis = String(row.basis_type); if (!["documented_experience", "gap_or_unknown"].includes(basis)) bad("basis_type"); refs(row.candidate_refs, candidate, "candidate_refs", basis === "documented_experience" ? 1 : 0); });
  } else {
    const rows = array(result.findings, "findings", 1); rows.forEach((item) => { const row = object(item, "finding"); const type = String(row.type); if (!["strength", "issue", "missing", "fact_conflict"].includes(type)) bad("finding type"); if (type === "missing") { if (row.answer_quote !== null) bad("缺失要素不能伪造回答引文"); } else { const quote = string(row.answer_quote, "answer_quote"); if (!input.answer?.text.includes(quote)) bad("answer_quote 不属于当前回答"); } string(row.comment, "comment"); string(row.improvement, "improvement"); refs(row.candidate_refs, candidate, "candidate_refs"); }); if (!rows.some((item) => String(object(item, "finding").type) !== "missing")) bad("反馈未引用当前回答"); string(result.improved_answer, "improved_answer"); string(result.follow_up, "follow_up"); claims(result.improvement_claims, String(result.improved_answer), "improvement_claims");
  }
  return out;
}
