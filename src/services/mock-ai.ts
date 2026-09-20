import type { CandidateProfile, InterviewRound, JobPosting, MockSession, ResumeVersion, Review, Transcript } from "@/domain/types";

export type ProviderError = { code: "MOCK_FAILURE" | "VALIDATION_ERROR" | "STALE_INPUT"; message: string; retryable: boolean };
export type ProviderResult<T> = { ok: true; data: T; meta: { requestId: string; provider: "mock"; isMock: true; inputVersion: string; generatedAt: string } } | { ok: false; error: ProviderError };
export interface ResumeSuggestion { id: string; before: string; after: string; reason: string; evidenceIds: string[]; requiresConfirmation: boolean; }
export interface ResumeDraft { draftMarkdown: string; suggestions: ResumeSuggestion[]; missingFacts: string[]; warnings: string[]; }
export interface PrepPackage { introOutline: string[]; projectFocus: { text: string; evidenceIds: string[] }[]; questionGroups: { title: string; questions: string[]; answerPoints: string[] }[]; questionsToAsk: string[]; checklist: { id: string; text: string; done: boolean }[]; }
export interface MockTurnOutput { acknowledgement: string; nextQuestion: string | null; questionId: string | null; isFollowup: boolean; finished: boolean; }

const wait = (ms = 520) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const ok = <T>(data: T, inputVersion: string): ProviderResult<T> => ({ ok: true, data, meta: { requestId: `mock-${Date.now()}`, provider: "mock", isMock: true, inputVersion, generatedAt: new Date().toISOString() } });

export async function tailorResume(profile: CandidateProfile, job: JobPosting, masterResume: string, currentDraft?: string): Promise<ProviderResult<ResumeDraft>> {
  await wait();
  const facts = profile.facts;
  const draftMarkdown = currentDraft || `# ${profile.name}\n\n## 求职目标\n${job.title} · ${job.company}\n\n## 个人简介\n${profile.headline}，拥有 ${profile.yearsOfExperience} 年开发经验，重点实践 RAG、工具调用与可复现评估。\n\n## 项目经历\n- 围绕企业知识库实现混合检索、Rerank 与答案引用。\n- 在 180 条项目内标注问题的离线评估集上，Recall@5 从 68% 提升到 84%。\n- 为内部工单助手设计参数校验、失败重试与敏感操作人工确认。\n\n## 技能\n${job.tags.join("、")}、Python、FastAPI、Docker、SQL\n\n## 教育经历\n${profile.education.school} · ${profile.education.major} · ${profile.education.degree}`;
  return ok({
    draftMarkdown,
    suggestions: [
      { id: `suggest-${job.id}-1`, before: "企业知识库问答项目", after: "围绕企业知识库实现混合检索、Rerank 与答案引用", reason: "突出该岗位关注的检索质量与可解释输出。", evidenceIds: ["ev-rag-stack"], requiresConfirmation: true },
      { id: `suggest-${job.id}-2`, before: "检索效果提升", after: "在 180 条项目内标注问题的离线评估集上，Recall@5 从 68% 提升到 84%", reason: "保留指标口径，不将离线检索指标改写成线上准确率。", evidenceIds: ["ev-rag-metric"], requiresConfirmation: true },
    ],
    missingFacts: ["尚无 Kubernetes 生产经验，未写入简历。"],
    warnings: ["这是 Mock 草稿，需由你检查和保存；不会自动投递。", masterResume ? "内容来自演示档案事实。" : "未找到基础简历。"],
  }, `profile-${profile.version}-${job.id}`);
}

export async function prepareInterview(profile: CandidateProfile, job: JobPosting, resume: ResumeVersion | null, round: InterviewRound): Promise<ProviderResult<PrepPackage>> {
  await wait();
  return ok({
    introOutline: [`用 60 秒说明你与 ${job.title} 的关联`, "先讲项目背景，再讲个人负责的边界", "明确离线指标与未覆盖的生产事实"],
    projectFocus: [{ text: "企业知识库：混合检索、Rerank、引用与 Recall@5 评估", evidenceIds: ["ev-rag-stack", "ev-rag-metric"] }, { text: "工单助手：工具参数校验、失败重试、人工确认", evidenceIds: ["ev-agent-tools"] }],
    questionGroups: [{ title: "RAG 与评估", questions: ["如何证明检索效果变好了？", "权限过滤应放在哪个环节？"], answerPoints: ["评估样本与 Recall@5", "区分检索指标和答案质量", "承认演示项目未覆盖的部分"] }, { title: "工具调用", questions: ["工具超时后怎样重试？"], answerPoints: ["上限、超时、幂等、人工接管"] }],
    questionsToAsk: ["团队如何定义应用质量与线上回归？", "这个岗位当前最需要补齐的工程能力是什么？"],
    checklist: [{ id: `${round.id}-prep-1`, text: "梳理一个项目的背景、行动与结果", done: false }, { id: `${round.id}-prep-2`, text: "复习 RAG 评估口径与权限边界", done: false }, { id: `${round.id}-prep-3`, text: "准备一次工具失败与幂等案例", done: false }, { id: `${round.id}-prep-4`, text: "完成一次文字模拟面试", done: false }],
  }, `profile-${profile.version}-${job.id}-${resume?.id ?? "none"}`);
}

export async function nextMockTurn(job: JobPosting, session: MockSession, answer: string, questions: { id: string; question: string; followup: string }[]): Promise<ProviderResult<MockTurnOutput>> {
  await wait(420);
  const question = questions[session.currentQuestionIndex];
  if (!question) return ok({ acknowledgement: "本次模拟已没有更多题目。", nextQuestion: null, questionId: null, isFollowup: false, finished: true }, session.id);
  const mentionsMetric = /Recall|评估|样本|指标|口径/i.test(answer);
  const mentionsIdempotency = /幂等|重复执行|去重/i.test(answer);
  const needsMetricFollowup = question.id === "q-1" && mentionsMetric && !/样本|数据集/.test(answer) && !session.followupAsked;
  const needsIdempotencyFollowup = question.id === "q-2" && /重试|超时/.test(answer) && !mentionsIdempotency && !session.followupAsked;
  if (needsMetricFollowup || needsIdempotencyFollowup) return ok({ acknowledgement: "已记录你的回答。这里有一个针对回答中遗漏点的追问。", nextQuestion: question.followup, questionId: question.id, isFollowup: true, finished: false }, session.id);
  const next = questions[session.currentQuestionIndex + 1];
  return ok({ acknowledgement: mentionsMetric || mentionsIdempotency ? "回答中包含了可核验的工程要点。" : "已记录。可以继续补充边界和验证方式。", nextQuestion: next?.question ?? null, questionId: next?.id ?? null, isFollowup: false, finished: !next }, session.id);
}

export async function reviewInterview(job: JobPosting, transcript: Transcript): Promise<ProviderResult<Review>> {
  await wait();
  const has = (pattern: RegExp) => transcript.segments.filter((segment) => pattern.test(segment.text)).map((segment) => segment.id);
  const strengthMetric = has(/Recall|评估/);
  const strengthIdempotency = has(/幂等|重试/);
  const permission = has(/权限|多租户/);
  const latency = has(/p95|延迟|TTFT/);
  return ok({ id: `review-${transcript.id}-${transcript.revision ?? 1}`, interviewId: transcript.interviewId, transcriptId: transcript.id, isMock: true, strengths: [{ text: "能说明评估样本与检索指标，保留指标口径。", segmentIds: strengthMetric }, { text: "提到重试上限、人工接管或幂等边界。", segmentIds: strengthIdempotency }].filter((note) => note.segmentIds.length > 0), improvements: [{ text: "继续补充权限过滤与引用泄露的处理边界。", segmentIds: permission }, { text: "补充 TTFT、p95 与分段 trace 的测量方案；这不是已有经历。", segmentIds: latency }].filter((note) => note.segmentIds.length > 0), nextTasks: ["演练一个带权限控制的 RAG 设计题", "整理从检索到生成的延迟分解方法"], notice: `仅基于当前样例文字复盘 ${job.title}；不预测录用概率，不推断面试官心理。`, transcriptRevision: transcript.revision ?? 1, stale: false }, `transcript-${transcript.id}-${transcript.revision ?? 1}`);
}
