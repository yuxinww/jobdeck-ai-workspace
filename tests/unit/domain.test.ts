import { describe, expect, it } from "vitest";
import { assertWorkspaceReferences } from "@/domain/schema";
import { createSeedWorkspace } from "@/domain/seed";
import { nextMockTurn } from "@/services/mock-ai";

describe("AI 求职工作台 seed 与 Mock 规则", () => {
  it("保留 20 个机会、18 个初始岗位和一卡一简历关系", () => {
    const workspace = createSeedWorkspace();
    expect(workspace.jobs).toHaveLength(20);
    expect(workspace.jobs.filter((job) => job.seedBatch === 0)).toHaveLength(18);
    expect(workspace.cards).toHaveLength(12);
    expect(workspace.resumes).toHaveLength(12);
    expect(new Set(workspace.cards.map((card) => card.jobId)).size).toBe(12);
    expect(workspace.cards.every((card) => workspace.resumes.some((resume) => resume.id === card.resumeId && resume.cardId === card.id))).toBe(true);
    expect(assertWorkspaceReferences(workspace)).toBe(true);
  });

  it("Mock 追问会区分评估样本和幂等缺口", async () => {
    const workspace = createSeedWorkspace();
    const base = { id: "session-test", cardId: "card-001", interviewId: null, resumeVersionId: null, status: "active" as const, turns: [], currentQuestionIndex: 0, followupAsked: false, isMock: true as const };
    const metric = await nextMockTurn(workspace.jobs[0], base, "我们看 Recall@5 和离线评估指标。", workspace.mockQuestionBank);
    expect(metric.ok).toBe(true);
    if (metric.ok) expect(metric.data.isFollowup).toBe(true);
    const idempotencySession = { ...base, currentQuestionIndex: 1 };
    const retry = await nextMockTurn(workspace.jobs[0], idempotencySession, "遇到超时会重试，但还没有设计这部分处理。", workspace.mockQuestionBank);
    expect(retry.ok).toBe(true);
    if (retry.ok) expect(retry.data.isFollowup).toBe(true);
  });

  it("复盘输入只生成可引用现存片段的 Mock 结果", () => {
    const workspace = createSeedWorkspace();
    const transcript = workspace.transcripts[0];
    expect(transcript.segments.map((segment) => segment.id)).toContain("seg-2");
    expect(workspace.reviews[0].strengths.every((note) => note.segmentIds.every((id) => transcript.segments.some((segment) => segment.id === id)))).toBe(true);
  });
});
