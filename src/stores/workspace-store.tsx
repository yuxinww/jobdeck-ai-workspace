"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { assertWorkspaceReferences, parsePersistedWorkspace } from "@/domain/schema";
import { createSeedWorkspace } from "@/domain/seed";
import type { AiRun, ClosedReason, InterviewRound, JobCard, MockReport, MockSession, MockTurn, PrepTask, ProfileModule, ResumeVersion, Review, Stage, Transcript, TranscriptSegment, WorkspaceData } from "@/domain/types";
import { stageLabel } from "@/domain/types";
import type { MockTurnOutput } from "@/services/mock-ai";

const STORAGE_KEY = "job-workspace:mock:v1";
const BASE_TIME = Date.parse("2026-09-20T10:00:00+08:00");

type CommitResult = { ok: true } | { ok: false; message: string };
type WorkspaceContextValue = {
  data: WorkspaceData; revision: number; hydrated: boolean; notice: string | null; storageError: string | null;
  clearNotice: () => void; resetDemo: () => CommitResult; addJobToBoard: (jobId: string) => CommitResult;
  moveCard: (cardId: string, stage: Stage, operationId?: string) => CommitResult;
  closeCard: (cardId: string, reason: ClosedReason) => CommitResult;
  recordApplication: (cardId: string, input: { channel: string; submittedAt: string; resumeVersionId: string | null; notes: string }) => CommitResult;
  voidApplication: (applicationId: string, reason: string) => CommitResult;
  saveResumeVersion: (resumeId: string, contentMarkdown: string, origin?: ResumeVersion["origin"], evidenceIds?: string[]) => CommitResult;
  saveAiRun: (run: AiRun) => CommitResult;
  restoreResumeVersion: (versionId: string) => CommitResult;
  addInterviewRound: (cardId: string, input: { kind: string; startsAt: string | null; resumeVersionId: string | null }) => CommitResult;
  togglePrepTask: (interviewId: string, taskId: string) => CommitResult;
  startMockSession: (cardId: string, interviewId: string | null, resumeVersionId: string | null) => CommitResult;
  appendMockExchange: (sessionId: string, answer: string, output: MockTurnOutput) => CommitResult;
  finishMockSession: (sessionId: string) => CommitResult;
  importSampleTranscript: (interviewId: string) => CommitResult;
  editTranscriptSegment: (transcriptId: string, segmentId: string, text: string) => CommitResult;
  saveReview: (review: Review) => CommitResult;
  updateProfile: (patch: { cities: string[]; salaryMinK: number; salaryMaxK: number }) => CommitResult;
  updateProfileModules: (modules: ProfileModule[]) => CommitResult;
  updateInterviewPrep: (interviewId: string, prep: PrepTask[]) => CommitResult;
  setNotice: (message: string) => void;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const deterministicNow = (domain: WorkspaceData) => new Date(BASE_TIME + domain.timeline.length * 60_000).toISOString();
const nextId = (prefix: string, list: { id: string }[]) => `${prefix}-${String(list.length + 1).padStart(3, "0")}`;

function event(domain: WorkspaceData, cardId: string, type: string, summary: string, payload?: Record<string, unknown>, actor: "user" | "mock_ai" | "system" = "user") {
  domain.timeline.push({ id: nextId("event", domain.timeline), cardId, type, actor, at: deterministicNow(domain), summary, payload });
}

function withCard(domain: WorkspaceData, cardId: string, fn: (card: JobCard) => void) {
  const card = domain.cards.find((item) => item.id === cardId);
  if (!card) throw new Error("找不到岗位卡片");
  fn(card);
  card.updatedAt = deterministicNow(domain);
}

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<WorkspaceData>(() => createSeedWorkspace());
  const [revision, setRevision] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const [notice, setNoticeState] = useState<string | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = parsePersistedWorkspace(JSON.parse(raw));
        assertWorkspaceReferences(parsed.domain);
        const restored = clone(parsed.domain);
        restored.profile.modules = restored.profile.modules ?? createSeedWorkspace().profile.modules;
        restored.sources = restored.sources ?? [];
        restored.aiRuns = restored.aiRuns ?? [];
        setData(restored);
        setRevision(parsed.revision);
      }
    } catch (error) {
      setStorageError(`本地演示数据无法读取：${error instanceof Error ? error.message : "格式不正确"}。当前使用内存中的固定种子，请先重置或修复存储。`);
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY && event.newValue) setNoticeState("检测到其他窗口更新了工作区；为避免覆盖新数据，请刷新当前页面。 ");
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const commit = useCallback((mutate: (draft: WorkspaceData) => void): CommitResult => {
    const draft = clone(data);
    try {
      mutate(draft);
      assertWorkspaceReferences(draft);
      const persisted = { schemaVersion: 1 as const, fixtureId: draft.fixtureId, revision: revision + 1, savedAt: deterministicNow(draft), domain: draft };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
      setData(draft);
      setRevision(revision + 1);
      setStorageError(null);
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "保存失败";
      setStorageError(`保存失败：${message}。本次操作未写入工作区。`);
      return { ok: false, message };
    }
  }, [data, revision]);

  const resetDemo = useCallback((): CommitResult => {
    const fresh = createSeedWorkspace();
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 1, fixtureId: fresh.fixtureId, revision: 0, savedAt: deterministicNow(fresh), domain: fresh }));
      setData(fresh); setRevision(0); setStorageError(null); setNoticeState("已恢复固定演示数据。 "); return { ok: true };
    } catch (error) { return { ok: false, message: error instanceof Error ? error.message : "重置失败" }; }
  }, []);

  const addJobToBoard = useCallback((jobId: string) => commit((draft) => {
    const job = draft.jobs.find((item) => item.id === jobId); if (!job) throw new Error("岗位不存在");
    const existing = draft.cards.find((card) => card.jobId === jobId);
    if (existing) { setNoticeState("这个岗位已经在看板中，已定位到原卡片。 "); return; }
    const cardId = nextId("card", draft.cards); const resumeId = nextId("resume", draft.resumes);
    draft.cards.push({ id: cardId, candidateId: draft.profile.id, jobId, resumeId, stage: "new", rank: Math.max(-1, ...draft.cards.filter((card) => card.stage === "new").map((card) => card.rank)) + 1, closedReason: null, nextAction: "阅读推荐理由", createdAt: deterministicNow(draft), updatedAt: deterministicNow(draft) });
    draft.resumes.push({ id: resumeId, cardId, activeVersionId: null, status: "not_started" });
    event(draft, cardId, "card_added", `加入看板：${job.title} · ${job.company}`, { jobId, resumeId });
  }), [commit]);

  const moveCard = useCallback((cardId: string, target: Stage, operationId?: string) => commit((draft) => {
    withCard(draft, cardId, (card) => {
      if (card.stage === target) return;
      const before = card.stage; card.stage = target; card.rank = Math.max(-1, ...draft.cards.filter((item) => item.stage === target && item.id !== card.id).map((item) => item.rank)) + 1; card.closedReason = target === "closed" ? card.closedReason : null; card.nextAction = target === "applied" ? "记录回复或跟进" : target === "interview_prep" ? "准备下一轮或复盘" : target === "closed" ? "选择结果或查看复盘" : target === "resume_prep" ? "检查并保存岗位简历" : target === "saved" ? "生成或准备简历" : "阅读推荐理由";
      event(draft, cardId, "stage_changed", `阶段：${stageLabel(before)} → ${stageLabel(target)}`, { before, target, operationId });
    });
  }), [commit]);

  const closeCard = useCallback((cardId: string, reason: ClosedReason) => commit((draft) => {
    withCard(draft, cardId, (card) => { const before = card.stage; card.stage = "closed"; card.closedReason = reason; card.nextAction = "查看结果与复盘"; event(draft, cardId, "stage_changed", `阶段：${stageLabel(before)} → Offer / 结束（${reason === "offer" ? "Offer" : reason === "rejected" ? "已拒绝" : reason === "withdrawn" ? "已退出" : "岗位关闭"}）`, { before, target: "closed", reason }); });
  }), [commit]);

  const recordApplication = useCallback((cardId: string, input: { channel: string; submittedAt: string; resumeVersionId: string | null; notes: string }) => commit((draft) => {
    const card = draft.cards.find((item) => item.id === cardId); if (!card) throw new Error("岗位卡片不存在");
    if (draft.applications.some((application) => application.cardId === cardId && !application.voidedAt)) throw new Error("该岗位已有有效投递记录");
    const version = input.resumeVersionId ? draft.resumeVersions.find((item) => item.id === input.resumeVersionId && item.resumeId === card.resumeId) : null;
    if (input.resumeVersionId && !version) throw new Error("投递版本不属于当前岗位简历");
    const id = nextId("application", draft.applications);
    draft.applications.push({ id, cardId, submittedAt: input.submittedAt, channel: input.channel.trim() || "未填写渠道", resumeVersionId: version?.id ?? null, resumeCapture: version ? "snapshot" : "not_recorded", notes: input.notes });
    card.stage = "applied"; card.nextAction = "记录回复或跟进"; event(draft, cardId, "application_recorded", "已记录外部手动投递（未发送申请）", { applicationId: id, resumeVersionId: version?.id ?? null });
  }), [commit]);

  const voidApplication = useCallback((applicationId: string, reason: string) => commit((draft) => {
    const application = draft.applications.find((item) => item.id === applicationId); if (!application || application.voidedAt) throw new Error("投递记录不存在或已作废");
    application.voidedAt = deterministicNow(draft); application.voidReason = reason; event(draft, application.cardId, "application_voided", "投递记录已标记作废", { applicationId, reason });
  }), [commit]);

  const saveResumeVersion = useCallback((resumeId: string, contentMarkdown: string, origin: ResumeVersion["origin"] = "user_edit", evidenceIds: string[] = []) => commit((draft) => {
    if (!contentMarkdown.trim()) throw new Error("简历正文不能为空");
    const resume = draft.resumes.find((item) => item.id === resumeId); if (!resume) throw new Error("简历容器不存在");
    const versions = draft.resumeVersions.filter((item) => item.resumeId === resumeId); const id = nextId("version", draft.resumeVersions);
    draft.aiRuns?.filter((run) => run.cardId === draft.cards.find((card) => card.resumeId === resumeId)?.id && run.status === "ready").forEach((run) => { run.status = "stale"; });
    draft.resumeVersions.push({ id, resumeId, number: versions.length + 1, origin, contentMarkdown, evidenceIds, createdAt: deterministicNow(draft) });
    resume.activeVersionId = id; resume.status = "ready"; const card = draft.cards.find((item) => item.resumeId === resumeId); if (card) { card.nextAction = "检查并确认岗位简历"; event(draft, card.id, "resume_saved", `保存岗位简历 v${versions.length + 1}`, { resumeId, versionId: id }); }
  }), [commit]);

  const saveAiRun = useCallback((run: AiRun) => commit((draft) => {
    if (!draft.cards.some((card) => card.id === run.cardId)) throw new Error("AI 运行引用的岗位卡片不存在");
    draft.aiRuns = [...(draft.aiRuns ?? []).filter((item) => item.runId !== run.runId), run];
    const statusLabel = run.status === "ready" ? "完成" : run.status === "needs_input" ? "需要补充材料" : run.status === "blocked" ? "已阻止" : run.status === "stale" ? "已过期" : "失败";
    event(draft, run.cardId, "ai_run_recorded", `DeepSeek ${run.action}：${statusLabel}`, { runId: run.runId, action: run.action, status: run.status, provider: run.provider, modelCalled: run.modelCalled }, "system");
  }), [commit]);

  const restoreResumeVersion = useCallback((versionId: string) => commit((draft) => {
    const source = draft.resumeVersions.find((item) => item.id === versionId); if (!source) throw new Error("历史版本不存在");
    const resume = draft.resumes.find((item) => item.id === source.resumeId); if (!resume) throw new Error("简历容器不存在");
    const versions = draft.resumeVersions.filter((item) => item.resumeId === source.resumeId); const id = nextId("version", draft.resumeVersions);
    draft.resumeVersions.push({ id, resumeId: source.resumeId, number: versions.length + 1, origin: "restored", contentMarkdown: source.contentMarkdown, evidenceIds: [...source.evidenceIds], createdAt: deterministicNow(draft) }); resume.activeVersionId = id; resume.status = "ready";
    const card = draft.cards.find((item) => item.resumeId === source.resumeId); if (card) event(draft, card.id, "resume_restored", `从 v${source.number} 恢复为新版本 v${versions.length + 1}`, { sourceVersionId: versionId, versionId: id });
  }), [commit]);

  const addInterviewRound = useCallback((cardId: string, input: { kind: string; startsAt: string | null; resumeVersionId: string | null }) => commit((draft) => {
    const card = draft.cards.find((item) => item.id === cardId); if (!card) throw new Error("岗位卡片不存在");
    const existing = draft.interviews.filter((item) => item.cardId === cardId); const id = nextId("interview", draft.interviews);
    const version = input.resumeVersionId && draft.resumeVersions.some((item) => item.id === input.resumeVersionId && item.resumeId === card.resumeId) ? input.resumeVersionId : null;
    draft.interviews.push({ id, cardId, round: existing.length + 1, kind: input.kind || `技术第${existing.length + 1}轮`, status: input.startsAt ? "scheduled" : "unscheduled", startsAt: input.startsAt, timezone: "Asia/Shanghai", resumeVersionId: version, prepTasks: [{ id: `${id}-task-1`, text: "梳理岗位重点与一个可核验项目", done: false }, { id: `${id}-task-2`, text: "准备评估口径与边界说明", done: false }, { id: `${id}-task-3`, text: "演练工具失败与幂等处理", done: false }, { id: `${id}-task-4`, text: "完成一次文字模拟面试", done: false }] });
    card.stage = "interview_prep"; card.nextAction = "完成面试准备清单"; event(draft, cardId, "interview_added", `新增${existing.length + 1}面${input.startsAt ? "并已安排时间" : "（时间待定）"}`, { interviewId: id });
  }), [commit]);

  const togglePrepTask = useCallback((interviewId: string, taskId: string) => commit((draft) => {
    const interview = draft.interviews.find((item) => item.id === interviewId); if (!interview) throw new Error("面试轮次不存在");
    const task = interview.prepTasks.find((item) => item.id === taskId); if (!task) throw new Error("准备任务不存在"); task.done = !task.done; event(draft, interview.cardId, "prep_task_toggled", `${task.done ? "完成" : "取消完成"}准备任务：${task.text}`, { interviewId, taskId });
  }), [commit]);

  const startMockSession = useCallback((cardId: string, interviewId: string | null, resumeVersionId: string | null) => commit((draft) => {
    const existing = (draft.mockSessions ?? []).find((session) => session.cardId === cardId && session.status === "active"); if (existing) return;
    const questions = draft.mockQuestionBank; const id = nextId("session", draft.mockSessions ?? []);
    draft.mockSessions = [...(draft.mockSessions ?? []), { id, cardId, interviewId, resumeVersionId, status: "active", turns: [{ id: `${id}-turn-1`, questionId: questions[0]?.id ?? "q-1", role: "interviewer", text: questions[0]?.question ?? "请介绍一个相关项目。", at: deterministicNow(draft) }], currentQuestionIndex: 0, followupAsked: false, isMock: true }];
    event(draft, cardId, "mock_started", "开始文字模拟面试（规则驱动 Mock）", { sessionId: id, interviewId });
  }), [commit]);

  const appendMockExchange = useCallback((sessionId: string, answer: string, output: MockTurnOutput) => commit((draft) => {
    const session = (draft.mockSessions ?? []).find((item) => item.id === sessionId); if (!session) throw new Error("模拟会话不存在");
    const current = draft.mockQuestionBank[session.currentQuestionIndex]; if (!answer.trim()) throw new Error("回答不能为空");
    session.turns.push({ id: `${session.id}-turn-${session.turns.length + 1}`, questionId: current?.id ?? "q-unknown", role: "candidate", text: answer.trim(), at: deterministicNow(draft) });
    if (output.nextQuestion && output.questionId) session.turns.push({ id: `${session.id}-turn-${session.turns.length + 1}`, questionId: output.questionId, role: "interviewer", text: output.nextQuestion, at: deterministicNow(draft) });
    session.followupAsked = output.isFollowup; session.currentQuestionIndex += output.isFollowup ? 0 : 1;
    if (output.finished) { session.status = "completed"; const answered = session.turns.filter((turn) => turn.role === "candidate").map((turn) => turn.questionId); session.report = { answeredQuestionIds: answered, skippedQuestionIds: draft.mockQuestionBank.filter((question) => !answered.includes(question.id)).map((question) => question.id), comments: [{ text: "这是规则驱动的 Mock 反馈，只基于已输入回答。", turnIds: session.turns.filter((turn) => turn.role === "candidate").map((turn) => turn.id) }], notice: "不预测录用概率，不代表真实面试评价。" } satisfies MockReport; }
    event(draft, session.cardId, "mock_answered", output.finished ? "结束文字模拟面试" : "保存模拟面试回答", { sessionId });
  }), [commit]);

  const finishMockSession = useCallback((sessionId: string) => commit((draft) => {
    const session = (draft.mockSessions ?? []).find((item) => item.id === sessionId); if (!session) throw new Error("模拟会话不存在"); session.status = "completed"; session.report = { answeredQuestionIds: session.turns.filter((turn) => turn.role === "candidate").map((turn) => turn.questionId), skippedQuestionIds: draft.mockQuestionBank.filter((question) => !session.turns.some((turn) => turn.role === "candidate" && turn.questionId === question.id)).map((question) => question.id), comments: [{ text: "提前结束；未回答的问题已明确标记。", turnIds: session.turns.filter((turn) => turn.role === "candidate").map((turn) => turn.id) }], notice: "这是未完成的规则驱动 Mock 报告，不预测录用概率。" }; event(draft, session.cardId, "mock_finished", "提前结束文字模拟面试", { sessionId });
  }), [commit]);

  const importSampleTranscript = useCallback((interviewId: string) => commit((draft) => {
    const interview = draft.interviews.find((item) => item.id === interviewId); if (!interview) throw new Error("面试轮次不存在");
    const sample = seedTranscript(draft); const existing = draft.transcripts.find((item) => item.interviewId === interviewId);
    if (existing) { existing.segments = sample.segments; existing.durationSeconds = sample.durationSeconds; existing.revision = (existing.revision ?? 1) + 1; draft.reviews.filter((review) => review.transcriptId === existing.id).forEach((review) => { review.stale = true; }); event(draft, interview.cardId, "transcript_updated", "更新样例转写，旧复盘已标记过期", { transcriptId: existing.id }); }
    else { const transcript = { ...sample, id: `transcript-${interviewId}`, interviewId, revision: 1 }; draft.transcripts.push(transcript); event(draft, interview.cardId, "transcript_imported", "导入样例转写（Mock，不请求麦克风）", { transcriptId: transcript.id }); }
  }), [commit]);

  const editTranscriptSegment = useCallback((transcriptId: string, segmentId: string, text: string) => commit((draft) => {
    const transcript = draft.transcripts.find((item) => item.id === transcriptId); if (!transcript) throw new Error("转写不存在"); const segment = transcript.segments.find((item) => item.id === segmentId); if (!segment) throw new Error("转写片段不存在"); if (!text.trim()) throw new Error("片段不能为空"); segment.text = text; transcript.revision = (transcript.revision ?? 1) + 1; draft.reviews.filter((review) => review.transcriptId === transcriptId).forEach((review) => { review.stale = true; }); const interview = draft.interviews.find((item) => item.id === transcript.interviewId); if (interview) event(draft, interview.cardId, "transcript_edited", "编辑转写片段，旧复盘已标记过期", { transcriptId, segmentId, revision: transcript.revision });
  }), [commit]);

  const saveReview = useCallback((review: Review) => commit((draft) => {
    const transcript = draft.transcripts.find((item) => item.id === review.transcriptId); if (!transcript) throw new Error("复盘引用的转写不存在"); const segmentIds = new Set(transcript.segments.map((segment) => segment.id)); if ([...review.strengths, ...review.improvements].some((note) => note.segmentIds.some((id) => !segmentIds.has(id)))) throw new Error("复盘包含悬空转写引用");
    draft.reviews = draft.reviews.filter((item) => item.transcriptId !== review.transcriptId); draft.reviews.push({ ...review, transcriptRevision: transcript.revision ?? 1, stale: false }); const interview = draft.interviews.find((item) => item.id === transcript.interviewId); if (interview) event(draft, interview.cardId, "review_generated", "生成带片段引用的模拟复盘", { reviewId: review.id, transcriptId: review.transcriptId });
  }), [commit]);

  const updateProfile = useCallback((patch: { cities: string[]; salaryMinK: number; salaryMaxK: number }) => commit((draft) => { draft.profile.preferences.cities = patch.cities; draft.profile.preferences.salaryMinK = patch.salaryMinK; draft.profile.preferences.salaryMaxK = patch.salaryMaxK; draft.profile.version += 1; draft.aiRuns?.filter((run) => run.status === "ready").forEach((run) => { run.status = "stale"; }); draft.timeline.push({ id: nextId("event", draft.timeline), cardId: "profile", type: "profile_updated", actor: "user", at: deterministicNow(draft), summary: "更新档案偏好；旧岗位分析需重新生成" }); setNoticeState("档案已保存。已有匹配分析会标记为需重新生成。 "); }), [commit]);
  const updateProfileModules = useCallback((modules: ProfileModule[]) => commit((draft) => { draft.profile.modules = modules; draft.profile.version += 1; draft.aiRuns?.filter((run) => run.status === "ready").forEach((run) => { run.status = "stale"; }); draft.timeline.push({ id: nextId("event", draft.timeline), cardId: "profile", type: "profile_modules_updated", actor: "user", at: deterministicNow(draft), summary: "更新档案模块", payload: { moduleIds: modules.map((module) => module.id) } }); setNoticeState("档案模块已保存。 "); }), [commit]);
  const updateInterviewPrep = useCallback((interviewId: string, prep: PrepTask[]) => commit((draft) => { const interview = draft.interviews.find((item) => item.id === interviewId); if (!interview) throw new Error("面试轮次不存在"); interview.prepTasks = prep; event(draft, interview.cardId, "prep_package_saved", "保存面试准备清单", { interviewId }); }), [commit]);

  const value = useMemo<WorkspaceContextValue>(() => ({ data, revision, hydrated, notice, storageError, clearNotice: () => setNoticeState(null), resetDemo, addJobToBoard, moveCard, closeCard, recordApplication, voidApplication, saveResumeVersion, saveAiRun, restoreResumeVersion, addInterviewRound, togglePrepTask, startMockSession, appendMockExchange, finishMockSession, importSampleTranscript, editTranscriptSegment, saveReview, updateProfile, updateProfileModules, updateInterviewPrep, setNotice: setNoticeState }), [data, revision, hydrated, notice, storageError, resetDemo, addJobToBoard, moveCard, closeCard, recordApplication, voidApplication, saveResumeVersion, saveAiRun, restoreResumeVersion, addInterviewRound, togglePrepTask, startMockSession, appendMockExchange, finishMockSession, importSampleTranscript, editTranscriptSegment, saveReview, updateProfile, updateProfileModules, updateInterviewPrep]);
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

function seedTranscript(domain: WorkspaceData): Transcript {
  const source = domain.transcripts[0];
  if (!source) return { id: "sample-transcript", interviewId: "", isMock: true, kind: "sample_transcript", durationSeconds: 0, segments: [], revision: 1 };
  return clone(source);
}

export function useWorkspace() { const value = useContext(WorkspaceContext); if (!value) throw new Error("useWorkspace must be used inside WorkspaceProvider"); return value; }
export const activeVersion = (data: WorkspaceData, resumeId: string) => { const resume = data.resumes.find((item) => item.id === resumeId); return data.resumeVersions.find((version) => version.id === resume?.activeVersionId) ?? null; };
export const cardForJob = (data: WorkspaceData, jobId: string) => data.cards.find((card) => card.jobId === jobId) ?? null;
export const jobForCard = (data: WorkspaceData, cardId: string) => { const card = data.cards.find((item) => item.id === cardId); return data.jobs.find((job) => job.id === card?.jobId) ?? null; };
export const interviewForCard = (data: WorkspaceData, cardId: string) => data.interviews.filter((interview) => interview.cardId === cardId).sort((a, b) => b.round - a.round);
export const sessionsForCard = (data: WorkspaceData, cardId: string) => (data.mockSessions ?? []).filter((session) => session.cardId === cardId);
