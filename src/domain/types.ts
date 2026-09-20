export type Id = string;
export type Stage = "new" | "saved" | "resume_prep" | "applied" | "interview_prep" | "closed";
export type ClosedReason = "offer" | "rejected" | "withdrawn" | "position_closed";
export type ResumeStatus = "not_started" | "draft" | "ready";
export type AiAction = "analyze_job" | "rewrite_resume" | "prepare_interview" | "review_answer";
export type AiRunStatus = "ready" | "needs_input" | "blocked" | "error" | "stale";
export type AiGenerationMode = "live" | "seed";
export type ProfileModuleKind = "work" | "education" | "publication" | "achievement" | "experience" | "intro" | "other" | "project" | "research" | "honor" | "skill" | "portfolio" | "custom";
export interface ProfileModule { id: Id; kind: ProfileModuleKind; title: string; content: string; }

export interface SourceSnapshot {
  id: Id;
  kind: "jd" | "candidate" | "resume" | "answer";
  text: string;
  revision: number;
  isSample: boolean;
  updatedAt: string;
  supersededBy?: Id;
}

export interface AiRun {
  runId: Id;
  requestId: Id;
  workspaceId: Id;
  cardId: Id;
  action: AiAction;
  status: AiRunStatus;
  mode: AiGenerationMode;
  provider: "deepseek" | "seed";
  promptVersion: string;
  basis: Record<string, unknown>;
  configuredModel?: string | null;
  actualModel?: string | null;
  completionId?: string | null;
  usage?: Record<string, number> | null;
  modelCalled: boolean;
  attempts: number;
  validation: string;
  semanticReview: "PENDING" | "PASSED" | "REJECTED";
  result?: unknown;
  errorCode?: string;
  errorMessage?: string;
  startedAt: string;
  finishedAt?: string;
}

export interface RequirementAnalysis {
  id: Id;
  jd_ref: { id: Id; quote: string };
  level: "must" | "bonus" | "unknown";
  candidate_refs: { id: Id; quote: string }[];
  relation: "supported" | "partial" | "unknown" | "explicit_gap";
  explanation: string;
  follow_up: string;
}

export interface JobAnalysisResult { requirements: RequirementAnalysis[]; }
export interface ResumeSuggestionResult {
  suggestions: {
    original_quote: string;
    proposed_text: string;
    why: string;
    jd_refs: { id: Id; quote: string }[];
    claims: { text: string; candidate_refs: { id: Id; quote: string }[] }[];
  }[];
}
export interface InterviewQuestionResult {
  questions: {
    id: Id;
    text: string;
    jd_refs: { id: Id; quote: string }[];
    candidate_refs: { id: Id; quote: string }[];
    basis_type: "documented_experience" | "gap_or_unknown";
    rationale: string;
  }[];
}
export interface AnswerReviewResult {
  findings: {
    type: "strength" | "issue" | "missing" | "fact_conflict";
    answer_quote: string | null;
    comment: string;
    improvement: string;
    candidate_refs: { id: Id; quote: string }[];
  }[];
  improved_answer: string;
  improvement_claims: { text: string; candidate_refs: { id: Id; quote: string }[] }[];
  follow_up: string;
}

export interface Fact { id: Id; text: string; kind: "experience" | "project" | "metric" | "education" | "user_confirmed"; }
export interface CandidateProfile {
  id: Id; isMock: true; version: number; name: string; headline: string; yearsOfExperience: number;
  education: { degree: string; major: string; school: string; start: string; end: string };
  preferences: { roles: string[]; cities: string[]; remoteAllowed: boolean; salaryMinK: number; salaryMaxK: number; currency: "CNY"; salaryPeriod: "month"; excluded: string[] };
  skills: string[]; gaps: string[]; facts: Fact[]; contact: { email: string; phone: string }; modules?: ProfileModule[];
}
export interface MatchResult {
  index: number | null; label: string; isMock: true; coverage: number; reason: string;
  evidenceIds: Id[]; gaps: string[]; hardConflicts: string[]; unknowns?: string[]; inputVersion?: string;
  dimensionScores?: { key: string; weight: number; value: number | null; reason: string }[];
}
export interface JobPosting {
  id: Id; isMock: true; company: string; title: string; city: string;
  salaryMinK: number | null; salaryMaxK: number | null; salaryMonths: number | null;
  currency: "CNY"; salaryPeriod: "month"; experienceMinYears: number; experienceMaxYears: number;
  degree: string; employment: string; tags: string[]; focus: string; source: string;
  sourceUrl: string | null; sourceJobId: string; publishedAt: string; capturedAt: string;
  availability: "open" | "closed" | "unknown"; seedBatch: 0 | 1;
  responsibilities: string[]; requirements: string[]; match: MatchResult; version?: number; jdText?: string; jdRevision?: number;
}
export interface JobCard { id: Id; candidateId: Id; jobId: Id; resumeId: Id; stage: Stage; rank: number; closedReason: ClosedReason | null; nextAction: string; createdAt: string; updatedAt: string; }
export interface ResumeDocument { id: Id; cardId: Id; activeVersionId: Id | null; status: ResumeStatus; }
export interface ResumeVersion { readonly id: Id; readonly resumeId: Id; readonly number: number; readonly origin: "mock_ai" | "user_edit" | "restored" | "external_snapshot"; readonly contentMarkdown: string; readonly evidenceIds: Id[]; readonly createdAt: string; readonly basis?: Record<string, unknown>; readonly requiresHumanReview?: boolean; }
export interface ApplicationRecord { id: Id; cardId: Id; submittedAt: string; channel: string; resumeVersionId: Id | null; resumeCapture: "snapshot" | "not_recorded"; notes: string; voidedAt?: string; voidReason?: string; }
export interface PrepTask { id: Id; text: string; done: boolean; }
export interface InterviewRound { id: Id; cardId: Id; round: number; kind: string; status: "unscheduled" | "scheduled" | "completed" | "cancelled"; startsAt: string | null; timezone: "Asia/Shanghai"; resumeVersionId: string | null; prepTasks: PrepTask[]; }
export interface MockTurn { id: Id; questionId: Id; role: "interviewer" | "candidate"; text: string; at: string; }
export interface MockSession { id: Id; cardId: Id; interviewId: Id | null; resumeVersionId: Id | null; status: "active" | "completed"; turns: MockTurn[]; currentQuestionIndex: number; followupAsked: boolean; isMock: true; report?: MockReport; }
export interface MockReport { answeredQuestionIds: Id[]; skippedQuestionIds: Id[]; comments: { text: string; turnIds: Id[] }[]; notice: string; }
export interface TranscriptSegment { id: Id; startSec: number; endSec: number; speaker: "interviewer" | "candidate" | "unknown"; text: string; }
export interface Transcript { id: Id; interviewId: Id; isMock: true; kind: "sample_transcript" | "user_notes"; durationSeconds: number; segments: TranscriptSegment[]; revision?: number; }
export interface CitedNote { text: string; segmentIds: Id[]; }
export interface Review { id: Id; interviewId: Id; transcriptId: Id; isMock: true; strengths: CitedNote[]; improvements: CitedNote[]; nextTasks: string[]; notice: string; transcriptRevision?: number; stale?: boolean; }
export interface TimelineEvent { id: Id; cardId: Id; type: string; actor: "user" | "mock_ai" | "system"; at: string; summary: string; operationId?: Id; payload?: Record<string, unknown>; }
export interface MockQuestion { id: Id; topic: string; question: string; followup: string; expectedPoints: string[]; }
export interface WorkspaceData { schemaVersion: 1; fixtureId: string; isMock: true; demoNow: string; demoTimezone: "Asia/Shanghai"; profile: CandidateProfile; masterResumeMarkdown: string; jobs: JobPosting[]; cards: JobCard[]; resumes: ResumeDocument[]; resumeVersions: ResumeVersion[]; applications: ApplicationRecord[]; interviews: InterviewRound[]; transcripts: Transcript[]; reviews: Review[]; timeline: TimelineEvent[]; mockQuestionBank: MockQuestion[]; mockSessions?: MockSession[]; sources?: SourceSnapshot[]; aiRuns?: AiRun[]; }
export interface PersistedWorkspace { schemaVersion: 1; fixtureId: string; revision: number; savedAt: string; domain: WorkspaceData; }

export const STAGES: { id: Stage; label: string; hint: string }[] = [
  { id: "new", label: "新发现", hint: "刚加入看板" },
  { id: "saved", label: "已收藏", hint: "值得继续评估" },
  { id: "resume_prep", label: "简历准备", hint: "定制与检查" },
  { id: "applied", label: "已投递", hint: "外部已确认" },
  { id: "interview_prep", label: "面试准备", hint: "准备与复盘" },
  { id: "closed", label: "Offer / 结束", hint: "结果与归档" },
];

export const stageLabel = (stage: Stage) => STAGES.find((item) => item.id === stage)?.label ?? stage;
export const closedReasonLabel = (reason: ClosedReason | null) => reason ? ({ offer: "Offer", rejected: "已拒绝", withdrawn: "已退出", position_closed: "岗位关闭" }[reason]) : "";
