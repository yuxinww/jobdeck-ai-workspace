# JobDeck V0.3 DeepSeek 接入实施审计

> 审计阶段：只读审计，不执行 V0.3 代码改造。
>
> 审计日期：2026-09-20。
>
> 当前基线：仓库中的 JobDeck V0.1；附件 `JobDeck_v0.3_DeepSeek_Live_API.zip` 已解压到临时目录并完成阅读。

## 审计结论

V0.1 已经是一套可运行的 Next.js/React 单页工作区，不需要重新创建项目，也不需要替换看板或卡片工作区。V0.3 应该采用“保留 UI 与领域命令，新增服务端 AI 边界，逐步替换正式 Mock 结果”的迁移方式。

可以直接复用的主干是：

- `WorkspaceApp`、看板六列、岗位卡片和卡片抽屉四个 Tab；
- `WorkspaceProvider` 的单快照本地持久化、`commit` 事务式更新、引用校验和固定时间线；
- `JobCard → JobPosting → ResumeDocument → ResumeVersion` 的一卡一岗位简历关系；
- 档案 facts/evidence、简历不可变版本、面试轮次、时间线和现有测试夹具。

必须新增或改造的边界是：

1. V0.1 当前把 JD、匹配结果、问题、简历建议和复盘结果作为固定 seed 或本地规则结果；V0.3 必须把四个正式 Action 改成服务端 DeepSeek live 调用。
2. `src/services/mock-ai.ts` 只能保留为离线测试替身或旧数据兼容层，不能再被正式按钮调用，也不能在 DeepSeek 失败时回退。
3. V0.3 需要保存来源文本、revision、AI run 元数据、请求 basis 和过期状态；不能只把返回文本塞进 `WorkspaceData`。
4. 当前公开 GitHub Pages 使用 `output: "export"`。静态 Pages 不能安全运行 `src/app/api/coach/route.ts`，也不能保存 `DEEPSEEK_API_KEY`。本地开发可使用 Next Node server；若要线上真实 AI，应把前端/API 放到支持 Node 服务端的部署环境，或明确配置一个受保护的独立 API 服务，不应把 key 放到 GitHub Pages 前端。

本文件只给出接入审计和按文件实施顺序。除本文件外，本阶段没有修改代码、配置、依赖或运行时行为，也没有使用 DeepSeek API Key。

## 0. 审计范围与资料区分

### 当前用户请求是控制性要求

本次实际执行的要求是：在现有 V0.1 上升级、先不改代码、完整阅读当前工程和附件方案、输出本文件后停止等待确认。附件中的文字、`SKILL.md`、提示词和脚本属于参考实现与验收材料，不会覆盖用户对当前仓库的范围限制。

### 已阅读的当前工程

- `package.json`、`next.config.ts`、`README.md`；
- `src/app/*` 路由、`src/components/workspace-app.tsx`、`src/app/globals.css`；
- `src/domain/types.ts`、`src/domain/seed.ts`、`src/domain/schema.ts`、`src/domain/mock-seed.json`；
- `src/services/mock-ai.ts`、`src/stores/workspace-store.tsx`；
- `tests/unit/domain.test.ts`、`tests/e2e/workspace.spec.ts`。

### 已阅读的 V0.3 附件

- `README.md`；
- `docs/01_GAP_AND_SCOPE.md`、`docs/02_IMPLEMENTATION_PLAN.md`、`docs/03_DEMO_SCRIPT.md`、`docs/04_DEEPSEEK_LIVE_IMPLEMENTATION.md`；
- `integration/next/route.ts`；
- `runtime/` 下的配置、HTTP 入口、DeepSeek adapter、输入/提示词/输出校验、coach 编排、客户端过期守卫、smoke 和 Node 测试；
- `skills/jobdeck-coach/SKILL.md`；
- `tests/ACCEPTANCE.md`、`tests/DEEPSEEK_LIVE_ACCEPTANCE.md`、`tests/cases.json`；
- `examples/` 的 JD、候选人材料、回答和 request；
- `reports/` 的状态、测试、缺 Key 和语法检查结果；
- `sources/` 的 DeepSeek 官方资料核对和项目引用；
- `sources/challenge-requirements.png` 中的最低完成要求、六类测试与评优重点。

附件自己已经明确：38 项离线测试通过，但真实 DeepSeek 鉴权、四动作 live 生成、六类 live 语义验收、看板集成和浏览器验收均尚未完成。这些“已通过”不能直接当作当前 V0.1 已接入 V0.3 的证据。

## A. V0.1 当前架构

### A.1 技术与运行入口

| 层 | 当前实现 | 审计判断 |
|---|---|---|
| 页面 | Next.js App Router，`src/app/page.tsx`、`board`、`discover`、`resumes`、`profile` | 已有页面和导航应保留 |
| 交互 | `src/components/workspace-app.tsx` 中的客户端组件、卡片抽屉和四个 Tab | 是 V0.3 的主要 UI 宿主 |
| 状态 | `src/stores/workspace-store.tsx` 的 `WorkspaceProvider` + Context | 可继续作为确定性业务命令层 |
| 域模型 | `src/domain/types.ts` | 需要从 mock-only 扩展为 live 可追溯模型 |
| 初始数据 | `src/domain/mock-seed.json` 经 `src/domain/seed.ts` 载入 | 只能作为虚构/脱敏输入和迁移兼容数据 |
| AI | `src/services/mock-ai.ts` | 需要改为正式按钮只请求 `/api/coach` |
| 存储 | 浏览器 `localStorage` 单一 JSON 快照 | V0.3 本地单用户可复用，但需要 schema migration 和 AI run 历史 |
| 校验 | `src/domain/schema.ts` 的 Zod 外壳 + `assertWorkspaceReferences` | 可复用引用检查模式，需要扩展 revision、来源和 AI 结果校验 |
| 测试 | Vitest 单测、Playwright E2E | 保留作为回归基线，新增 API/状态/过期结果测试 |

当前 `next.config.ts` 在本地开发时没有静态导出，在 GitHub Actions 下启用 `output: "export"`、仓库 `basePath` 和 `trailingSlash`。因此 V0.3 的同源 Next API 只能在 Node 服务端模式运行，不能在目前的 GitHub Pages 构建产物中运行。

### A.2 当前页面组成

`WorkspaceApp` 根据 `usePathname()` 选择页面，并把所有页面包在同一个 `WorkspaceProvider` 中：

- `BoardPage`：六列看板，搜索、城市和匹配筛选，拖动/菜单移动卡片；
- `DiscoverPage`：本地模拟岗位池，加入看板时创建唯一 `JobCard` 和 `ResumeDocument`；
- `ResumesPage`：按岗位列出简历容器并打开卡片的简历 Tab；
- `ProfilePage`：档案偏好、事实、缺口和模块编辑；
- `JobDrawer`：当前岗位的 `岗位分析 / 简历 / 面试 / 记录` 四个 Tab。

这与 V0.3 方案要求的“一张岗位卡、一个岗位工作区、四个动作”兼容，不应另起一个独立的 AI runtime UI。

### A.3 当前业务写入方式

所有写命令都走 `commit(mutate)`：

1. 深拷贝当前 `WorkspaceData`；
2. 执行确定性命令；
3. 执行 `assertWorkspaceReferences`；
4. 写入 `job-workspace:mock:v1`，保存 `schemaVersion / fixtureId / revision / savedAt / domain`；
5. 更新 React state 与 revision。

已有命令包括：加入看板、移动/关闭卡片、记录/作废投递、保存/恢复简历版本、新增面试轮次、切换准备任务、启动/追加/结束模拟会话、导入/编辑样例转写、保存模拟复盘、保存档案偏好和档案模块。

这些命令是 V0.3 应继续复用的“用户确认后写状态”边界。AI 请求本身不应直接改 domain；应先得到 `ready / needs_input / blocked / error`，经前端过期检查和人工确认后，再通过命令写入。

## B. 所有 Mock AI 所在位置

### B.1 Mock Provider 代码

文件：`src/services/mock-ai.ts`

| 函数/类型 | 当前行为 | V0.3 处理 |
|---|---|---|
| `ProviderResult<T>`、`ProviderError` | 固定 `provider: "mock"`、`isMock: true`、`mock-*` requestId | 仅保留为离线测试类型，正式结果改用服务端响应类型 |
| `tailorResume` | 通过模板拼接整份简历，返回两条固定建议、固定缺口与 warning | 替换为 `rewrite_resume` 客户端请求；不自动保存 |
| `prepareInterview` | 返回固定开场提纲、两个项目重点、固定问题组和 checklist | 替换为 `prepare_interview`；至少三题由当前 JD/材料实时生成 |
| `nextMockTurn` | 用正则匹配 Recall/评估/样本/幂等/重试等关键词决定固定追问 | 不作为正式 `review_answer`；正式动作必须检查当前题目和实际答案 |
| `reviewInterview` | 从固定转写片段匹配关键词，克隆结构化复盘 | 不作为 V0.3 `review_answer`；转写复盘属于当前 V0.1 旧能力，V0.3 暂不扩展 ASR/长转写 |
| `ok`、`wait` | 模拟延迟和固定 meta | 服务端 live adapter 自己负责请求、超时、attempts、completionId 和 usage |

### B.2 Mock 域字段和 seed 数据

文件：`src/domain/types.ts`、`src/domain/mock-seed.json`、`src/domain/seed.ts`、`src/domain/schema.ts`。

- `CandidateProfile.isMock: true`、`JobPosting.isMock: true`、`MatchResult.isMock: true`、`WorkspaceData.isMock: true`；
- `ResumeVersion.origin: "mock_ai"`；
- `MockSession`、`MockTurn`、`MockReport`、`MockQuestion`；
- `Transcript.isMock: true`、`Review.isMock: true`；
- seed 中的 `job.match`、8 个 seed resume versions、2 个 interviews、1 个 transcript、1 个 review、3 个 `mockQuestionBank`；
- `schema.ts` 用 `z.literal(true)` 要求恢复数据的 `domain.isMock` 为 true；
- `seed.ts` 为旧档案补 6 个 profile modules，但这不是 AI 生成。

当前 seed 统计：20 个岗位、12 张卡、12 个简历容器、8 个简历版本、6 条投递、2 个面试轮次、1 个转写、1 个复盘、18 条时间线、3 道固定模拟题。V0.3 不应把这些固定结果当成真实 DeepSeek 生成证据。

### B.3 Mock UI 入口和文案

文件：`src/components/workspace-app.tsx`。

- 侧栏品牌副标题 `AI 求职工作台 · Mock`；
- 顶部演示 banner 写明“不会调用模型”；
- 看板 top action 显示“规则驱动 Mock”；
- `AnalysisPanel` 直接展示 seed 的 `job.match`，没有真实 `analyze_job` 按钮；
- `ResumePanel` 的“生成岗位简历/重新生成建议”调用 `tailorResume`，还提供“模拟一次失败”；
- `InterviewPanel` 的“生成准备包”调用 `prepareInterview`，同时提供“模拟一次失败”；
- `MockInterviewPanel` 的“开始模拟/提交回答/提前结束”使用 `nextMockTurn`；
- `TranscriptPanel` 的“导入样例转写/生成模拟复盘”使用固定 transcript 与 `reviewInterview`；
- 多处显示“Mock Provider”“规则驱动”“样例转写”“模拟复盘”；
- `RecordsPanel` 显示 actor 为 `Mock AI` 的时间线文案，但 V0.1 实际写入事件主要由 `event()` 设为 `user`。

### B.4 Mock 测试和说明

- `tests/unit/domain.test.ts` 测试 `nextMockTurn` 的规则追问和 seed 复盘引用；
- `tests/e2e/workspace.spec.ts` 主要测试 UI 页面、加入幂等和档案模块持久化，没有真实 AI API 验收；
- `README.md` 明确将项目定义为 v0.1 Mock MVP；
- `src/stores/workspace-store.tsx` 的 `startMockSession`、`appendMockExchange`、`finishMockSession`、`importSampleTranscript`、`saveReview` 是 Mock 结果落盘路径。

## C. 可直接复用的代码

### C.1 必须复用

1. `src/components/workspace-app.tsx` 的布局、`JobDrawer`、四 Tab、卡片打开/关闭、现有表单和人工确认交互。
2. `src/stores/workspace-store.tsx` 的 Context、`commit`、`clone`、确定性时间线、localStorage 读写和错误提示。
3. `src/domain/types.ts` 中的 `JobCard`、`Stage`、`ResumeDocument`、`ResumeVersion`、`InterviewRound`、`Fact`、`TimelineEvent` 基础关系。
4. `src/domain/schema.ts` 的恢复解析和 `assertWorkspaceReferences` 思路。
5. `src/domain/seed.ts` / `src/domain/mock-seed.json` 中的虚构岗位、档案事实和简历素材，作为初始输入，不作为模型输出。
6. 既有 Playwright 的页面定位和 Vitest 的 domain 测试结构。

### C.2 有条件复用

附件 `runtime/lib/` 的职责划分可以直接迁移，但不要把它作为第二个长期运行的 standalone runtime：

- `input.mjs`：动作白名单、来源 revision、长度、consent 和缺失输入；
- `prompts.mjs`：公共事实边界、四动作输出结构和 `PROMPT_VERSION`；
- `output.mjs`：字段、题数、引用 ID、连续 quote、原句/答案引用检查；
- `deepseek.mjs`：官方域名、Bearer、JSON mode、thinking、超时、上游错误和一次请求；
- `coach.mjs`：输入 basis、run meta、缺失前置检查、真实调用和输出检查；
- `client-guard.mjs`：请求 ID、workspace、action 和完整输入快照一致性；
- `http.mjs`、`errors.mjs`：同源、Content-Type、正文大小和安全错误。

推荐把这些能力放入当前工程的 `src/lib/jobdeck-ai/` 或拆成 `src/services/coach.ts`、`src/services/deepseek.ts`、`src/services/coach-validation.ts`。如果保留 `.mjs`，必须确认 Next.js Node runtime 的 import 路径、类型声明和构建行为；不能把 Node-only 模块导入客户端组件。

### C.3 不应直接复用为正式结果

- `runtime/examples/request.json` 只能作为脱敏测试输入；
- `runtime/scripts/smoke.mjs` 只能用于配置完成后的真实联通验证；
- `runtime/test/core.test.mjs` 的 fake fetch 和 offline completion 只能作为单测替身；
- `src/services/mock-ai.ts` 的模板结果、固定题库和关键词规则不能作为 V0.3 用户结果；
- seed 中的 `match`、resume version、transcript、review 只能保留为历史演示数据并标明来源。

## D. 需要新增的服务端 API

### D.1 主入口

新增：`src/app/api/coach/route.ts`

建议直接采用附件的 Next adapter 结构：

- `export const runtime = "nodejs"`；
- `export const dynamic = "force-dynamic"`；
- 设置并核验部署平台的 `maxDuration`；
- `POST` 只接受 JSON，调用当前工程内部的 `handleCoachRequest`/`runCoach`；
- API Key 只从服务端 `process.env.DEEPSEEK_API_KEY` 读取；
- 前端不能覆盖 `model`、`baseURL`、system prompt、tools 或 provider；
- 失败只返回安全错误类别，不回传 key、完整 prompt、上游 body 或环境变量。

请求核心形态应保持附件契约：

```ts
{
  action: "analyze_job" | "rewrite_resume" | "prepare_interview" | "review_answer",
  workspaceId: string,
  requestId: string,
  jd: { id: string; revision: number; text: string },
  candidate: { id: string; revision: number; text: string },
  resume?: { id: string; revision: number; text: string },
  originalText?: string,
  question?: { id: string; text: string },
  answer?: { revision: number; text: string },
  instruction?: string,
  consent: boolean
}
```

响应状态必须区分：

- `ready`：有当前输入对应的结果，但仍需人工审核；
- `needs_input`：缺少 JD、候选人材料、原句、题目、答案或发送同意，且 `modelCalled=false`；
- `blocked`：例如要求编造不存在的经历，`result=null`，给出真实替代表达或补证方向；
- HTTP/Provider/validation `error`：保留输入，显示重试，不给固定成功答案。

响应的 `meta` 由服务端生成，至少包含 `runId`、`workspaceId`、`requestId`、`action`、`mode`、`provider`、`modelCalled`、`attempts`、`promptVersion`、`basis`、`configuredModel`、`actualModel`、`completionId`、`usage`、`elapsedMs`、`validation`、`semanticReview`。

### D.2 DeepSeek 配置

服务端环境变量沿用附件设计：

```dotenv
AI_MODE=live
DEEPSEEK_API_KEY=
DEEPSEEK_MODEL=deepseek-flash
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_THINKING=disabled
DEEPSEEK_REASONING_EFFORT=high
DEEPSEEK_MAX_TOKENS=8192
DEEPSEEK_TIMEOUT_MS=90000
```

运行入口只接受 `live`。缺 key、无余额、401、429、500/503、超时、截断、非法 JSON、引用校验失败都必须可见，不得换模型、换固定 seed 或回到 `mock-ai.ts`。

### D.3 部署约束

当前 GitHub Pages workflow 只发布静态 `out/`。它无法运行上述 Next Node API route，因此有两个可选架构：

1. **推荐本地/Node 部署**：前端和 `/api/coach` 同在 Next Node server，`.env.local` 只在服务端配置；适合当前 V0.3 开发与验收。
2. **拆分部署**：GitHub Pages 只做静态前端，API 部署到受保护的 Node 服务；需要身份验证、CORS、速率/额度限制、workspace 权限和 API 地址配置。不能直接把 DeepSeek key 或无保护 API 地址放进静态 bundle。

V0.3 方案本身也明确：当前 adapter 不是生产鉴权和限流方案，公开部署前必须补齐身份、权限、额度和速率限制。

## E. 需要修改的前端组件

目标是保留现有 UI 和看板架构，只替换 AI 触发和结果呈现。

| 当前位置 | 当前行为 | V0.3 修改 |
|---|---|---|
| `WorkspaceApp` 顶部 banner | 强调“不会调用模型”、显示 Mock | 改为“DeepSeek live / 当前输入版本 / 需要人工审核”，保留虚构材料提示和失败提示 |
| `BoardPage` / `JobCardView` | 六列与一卡一份简历 | 不改结构；只显示 AI 运行状态/待更新提示，不因拖动卡片自动调用模型 |
| `AnalysisPanel` | 直接渲染 `job.match` 固定结果 | 增加“分析岗位”按钮；调用 `analyze_job`；展示要求—证据表、supported/partial/unknown/explicit_gap、缺口和问题；保留 JD 原文入口 |
| `ResumePanel` | `tailorResume` 生成固定草稿和建议 | 改调用 `rewrite_resume`；保留原句、改写、理由、证据、采纳和手动编辑；只在用户确认后写新 `ResumeVersion` |
| `InterviewPanel` | `prepareInterview` 固定准备包 + 固定 checklist | 改调用 `prepare_interview`；动态至少三题，记录问题依据和所用简历版本；不把拖入“面试准备”当作已生成问题 |
| `MockInterviewPanel` | `nextMockTurn` 用规则推进固定题目 | 改为当前问题 + 实际回答的 `review_answer` 入口；回答 revision 变化时旧反馈过期；可暂保留 UI 形态，但正式反馈不能由 Mock 规则生成 |
| `TranscriptPanel` | 固定样例转写和 `reviewInterview` | V0.3 不扩展 ASR/真实录音；可保留为旧演示数据，但不能把“生成模拟复盘”标为正式 DeepSeek 结果，建议后续明确为 legacy 或从正式演示路径移除 |
| `RecordsPanel` | 主要展示业务时间线 | 加入 AI run、basis、prompt version、model/usage 状态和错误/过期事件；支持导出当前卡记录 |
| `ProfilePage` | 已有档案事实、缺口和模块 | 复用为 candidate source 展示；需要把用户编辑/纠正转为 candidate revision 和 superseded 关系，不把 AI 建议直接写入事实 |
| 新增 `src/services/coach-client.ts` | 当前不存在 | 浏览器只通过 `/api/coach` 请求；生成 requestId、冻结快照、记录 latestRequestId、解析状态和错误 |

四个正式按钮的命名建议：`分析岗位`、`生成修改建议`、`生成面试题`、`分析我的回答`。按钮只在用户主动点击时触发，不因打开页面、拖动阶段或刷新自动消耗 API。

## F. 数据模型需要增加的字段

当前模型是 `schemaVersion: 1` 且多处硬编码 `isMock: true`。建议采用向后兼容的 additive migration：读取 V0.1 快照时迁移到 V0.3 namespace/版本；不要直接把旧 seed 的 mock 结果伪装成 live 结果。

### F.1 来源与版本

建议新增：

```ts
interface SourceSnapshot {
  id: string;
  kind: "jd" | "candidate" | "resume" | "answer";
  text: string;
  revision: number;
  isSample: boolean;
  updatedAt: string;
}
```

其中 JD 不能只依赖现有 `responsibilities/requirements` 数组；需要保留用户当前 JD 原文、来源 ID 和 revision。候选人材料、档案事实和简历正文也要能生成稳定的来源片段。事实纠正后，旧 source 保留并标 `superseded`，当前请求只能引用最新 source。

### F.2 岗位工作区与分析

可以在现有 `JobCard` 基础上增量增加：

```ts
interface JobWorkspaceBasis {
  workspaceId: string;
  cardId: string;
  jdSourceId: string;
  jdRevision: number;
  candidateSourceId: string;
  candidateRevision: number;
  activeResumeVersionId: string | null;
}
```

`JobPosting` 保留现有展示字段，但增加 `jdSourceId`/`jdRevision` 或嵌入 `jdSource` 快照。分析结果建议单独保存：

```ts
interface JobAnalysis {
  id: string;
  cardId: string;
  basis: JobWorkspaceBasis;
  requirements: Array<{
    id: string;
    jdRef: { id: string; quote: string };
    level: "must" | "bonus" | "unknown";
    candidateRefs: { id: string; quote: string }[];
    relation: "supported" | "partial" | "unknown" | "explicit_gap";
    explanation: string;
    followUp: string;
  }>;
  status: "ready" | "needs_input" | "blocked" | "error";
  runId: string;
  stale: boolean;
}
```

`job.match` 可以继续作为 V0.1 历史展示，但不应覆盖或冒充新的 `JobAnalysis`。

### F.3 AI run 元数据

新增 `AiRun` 数组是 V0.3 的核心：

```ts
interface AiRun {
  runId: string;
  requestId: string;
  workspaceId: string;
  cardId: string;
  action: "analyze_job" | "rewrite_resume" | "prepare_interview" | "review_answer";
  status: "ready" | "needs_input" | "blocked" | "error" | "stale";
  mode: "live";
  provider: "deepseek";
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
  resultRef?: string;
  errorCode?: string;
  startedAt: string;
  finishedAt?: string;
}
```

服务端 meta 是事实来源；不能让模型自己填 `completionId`、usage、model 或“已验证”。

### F.4 简历、面试和回答

- `ResumeVersion` 增加 `basis`/`sourceRevisions`、`runId`、`requiresHumanReview`；继续保留不可变版本和用户确认边界。`"mock_ai"` 只标旧历史，live 建议不要在用户确认前写成正式版本。
- 新增 `ResumeSuggestion` 持久化对象，保存 `originalQuote`、`proposedText`、`claims`、JD refs、candidate refs、why、warnings、runId、stale`；采纳后才产生新的用户简历版本。
- `InterviewRound` 可保留；新增 `InterviewQuestion`，包含问题 ID、文本、JD refs、candidate refs、basis type、rationale、source run、resumeVersionId、stale`。
- 新增 `AnswerAttempt`，包含 `questionId`、`answer`、`revision`、`resumeVersionId`、`jdRevision`、`candidateRevision`、用户是否明确提交。
- 新增 `AnswerReview`，包含 findings、answer quote、candidate refs、improved answer、improvement claims、follow-up、runId、answer revision、stale`。
- `TimelineEvent.actor` 增加 live AI/系统来源或在 payload 中增加 `runId`，避免把 DeepSeek 结果写成普通 user event。

### F.5 持久化与迁移字段

外层快照建议从 `schemaVersion: 1` 迁移到明确的 V0.3 版本，例如 `schemaVersion: 2`，并增加：

- `sources`、`analyses`、`resumeSuggestions`、`interviewQuestions`、`answerAttempts`、`answerReviews`、`aiRuns`；
- `latestRequestIdByAction` 或按 card/workspace 保存的请求状态；
- `migrationVersion`/`migratedAt`；
- 旧 `mock` 数据的 `legacy: true` 或 `generationMode: "seed"` 标记。

不要把 DeepSeek key、完整 system prompt、未脱敏 API response headers、只应短期存在的密钥或服务端环境写入 localStorage。

## G. DeepSeek 调用链路

推荐链路与附件 `docs/04_DEEPSEEK_LIVE_IMPLEMENTATION.md` 一致：

```text
用户点击某个 AI Action
  ↓
前端冻结当前 card / JD / candidate / resume / question / answer 快照
  ↓
生成新的 requestId，并更新该 action 的 latestRequestId
  ↓
POST /api/coach（只发材料、action、revision、consent）
  ↓
Next Node route：同源、JSON、大小、认证/权限、单用户/限流检查
  ↓
parseInput：只允许四个 action 和明确字段；缺资料先 needs_input，不调用模型
  ↓
splitSources：当前 JD 生成 J001…，候选人材料生成 C001…，保留 revision
  ↓
buildMessages：公共事实规则 + 当前动作结构 + 用户材料作为不可信数据
  ↓
loadConfig：仅 live、官方域名、服务端 DEEPSEEK_API_KEY、模型/超时校验
  ↓
DeepSeek POST /chat/completions：JSON object、非流式、单次请求、无自动 fallback
  ↓
检查 finish_reason、JSON 对象、字段、题数、来源 ID、连续 quote 和边界
  ↓
返回 ready / needs_input / blocked / error + 服务端 meta
  ↓
前端 shouldApplyResult：同时核对 requestId、workspace/card、action、所有输入快照
  ↓
显示“待人工审核”；用户采纳/保存后才通过 Workspace command 写入版本和时间线
  ↓
保存 AiRun、结果快照、来源 revision 和 stale 状态
```

四个 Action 的输入输出对接如下：

| Action | 当前 V0.1 替换点 | V0.3 关键输出约束 |
|---|---|---|
| `analyze_job` | `AnalysisPanel` 当前直接读 `job.match` | 每个核心要求有 JD quote、候选人 refs、relation、解释和 follow-up |
| `rewrite_resume` | `ResumePanel.runGenerate` 的 `tailorResume` | `original_quote` 必须来自当前原句；改写 claims 必须出现在建议正文且逐条有候选人引用 |
| `prepare_interview` | `InterviewPanel.generatePrep` 的 `prepareInterview` | 至少三道不重复问题，每题绑定 JD，区分 documented experience 与 gap/unknown |
| `review_answer` | `MockInterviewPanel.sendAnswer`/当前无正式反馈入口 | findings 必须根据当前题目和答案变化；有效/问题引用答案原文，missing 不伪造 quote，给改法和追问 |

错误链路必须保持“可见失败”：401/402/429/500/503、网络异常、超时、输出截断、非法 JSON、引用失败都显示明确错误；不回退 `src/services/mock-ai.ts`，不把旧 seed 结果重新显示为成功。

## H. 状态与版本管理方案

### H.1 V0.1 当前状态能力

V0.1 已有：

- 卡片阶段 `new / saved / resume_prep / applied / interview_prep / closed`；
- `WorkspaceData` 总 revision 和浏览器持久化 revision；
- profile version、resume version、transcript revision；
- 保存简历产生不可变新版本；
- 转写编辑会把旧复盘标记 stale；
- `cardId → jobId/resumeId` 关系校验；
- `storage` 事件提示其他窗口更新。

V0.1 尚无：

- 原始 JD/候选人材料的独立 source revision；
- 每个 AI Action 的 requestId/latest request guard；
- AI run、prompt version、model、completionId、usage、basis；
- 结果与当前输入的 stale 状态；
- A 岗位结果迟到后防止覆盖 B 岗位的前端接线；
- 答案 revision 和同题不同答案的独立反馈历史。

### H.2 V0.3 状态规则

1. **按岗位隔离**：`workspaceId/cardId` 是每次请求的强边界；切换 JD-B 时创建新卡或同卡提升 JD revision，不能沿用 A 的专属判断。
2. **按来源版本隔离**：每次 run 保存 JD、candidate、resume、question、answer revision 与 hash；来源更新后旧结果仍可看，但只能标历史/过期。
3. **按请求隔离**：同一 action 重复点击生成新 requestId；返回时同时比较 requestId、card/workspace、action 和完整输入 key。
4. **事实纠正**：例如 180→80，创建新 candidate revision，旧事实标 superseded；新结果只引用 80，历史结果不静默改写。
5. **人工确认**：模型建议、学习计划、假设设计和回答示例不能自动进入 `profile.facts` 或简历事实；采纳只是用户编辑行为，需要单独记录来源。
6. **缺少输入**：只给 JD 可以拆要求但不能判断候选人；只给候选人不能做岗位匹配；空输入不能偷偷加载 seed；缺答案不调用 `review_answer`。
7. **失败无伪成功**：失败保留当前输入和已有版本，允许手动重试；不展示预置成功结果，不自动换模型，不无限重试。
8. **阶段与 AI 状态分离**：卡片拖入“面试准备”只改变看板阶段，不代表 `prepare_interview` 已完成；只有真实 run 的 `ready` 结果才可显示已生成问题。

## I. 测试方案

### I.1 现有回归必须保留

- `npm run lint`、`npm run typecheck`、`npm run test:unit`、`npm run build`；
- Playwright 的首页六列/四入口、岗位发现加入幂等、截图和档案模块持久化；
- 一卡一份岗位简历、版本恢复、投递引用、面试轮次、时间线和 localStorage 刷新。

### I.2 V0.3 离线工程测试

把附件 `runtime/test/core.test.mjs` 的 38 项语义/协议检查迁入当前工程的测试体系，或者在确认 Node `.mjs` 边界后作为当前仓库的独立无网络测试运行；测试替身必须注入 provider，不得把 fake completion 当 live 证据。至少覆盖：

- 缺 key、非法模式、非法模型/timeout、非官方 URL；
- 前端覆盖 model、未知 action、未知字段和跨站请求；
- 缺 JD/候选人/原句/题目/答案/consent 时不调用模型；
- J/C source ID 稳定、revision/hash 进入 basis、JD 引用和候选人引用不混用；
- 伪造 quote、悬空 evidence、重复问题、少于三题、原句不属于当前材料；
- 401/402/404/422/429/500/503、网络失败、超时、截断、非法 JSON、usage 缺失；
- blocked 结果保持 `result=null`；
- A 迟到结果不能覆盖 B，答案修改会使旧 feedback 失效；
- HTTP Content-Type、body size、同源限制和安全错误。

### I.3 当前工程状态/持久化测试

新增单元测试应验证：

- V0.1 快照能迁移到 V0.3 schema；
- JD/candidate/resume revision 更新会标记对应分析、建议、题目或反馈 stale；
- 用户采纳建议只创建新简历版本，不修改历史版本和 facts；
- 事实纠正保留 superseded 历史，新结果只使用最新 source；
- `AiRun` 的 status、requestId、runId、basis 和 error 正确落盘；
- 刷新页面后结果、历史和 stale 标志仍存在；
- 旧 Mock seed 可以查看，但不会成为新 live run 的结果。

### I.4 浏览器 E2E

以真实 UI 逐项覆盖：

1. 点击 `分析岗位`，等待 ready，检查要求—证据关系和 run 状态；
2. 修改 JD 或档案后，旧分析显示过期，再生成新分析；
3. 生成改写，采纳一条并手动改一句，保存 v2，刷新后 v1/v2 都存在；
4. 生成至少三道问题，输入回答，点击 `分析我的回答`，检查引用当前答案；
5. 同一题换答案，旧反馈不覆盖新反馈；
6. 触发缺输入、blocked、失败和重试，确认没有 Mock 成功文案；
7. 用可控延迟模拟 A→B，确认 A 不覆盖 B；
8. 检查浏览器 bundle、localStorage 和网络请求中没有 API key。

### I.5 DeepSeek live 验收

按附件 `tests/DEEPSEEK_LIVE_ACCEPTANCE.md` 的 D01–D17 分层记录：

- L0：离线工程测试；
- L1：`/models` 和四动作真实 smoke；
- L2：T01–T11 六类/回归语义验收；
- L3：完整浏览器和持久化验收。

每次记录必须包含 model、thinking、workspace/JD/candidate/resume/question/answer 版本、prompt version、输入 hash、completionId、usage、输出文件、人工判定和限制。当前审计阶段全部 live 项目仍为 NOT_RUN。

## J. 按文件列出的实施步骤

下面是得到确认后才执行的顺序；本次审计没有执行这些步骤。

### J0：保持当前基线并建立迁移边界

- `src/domain/types.ts`：先定义 V0.3 的 source、basis、AI run、analysis、suggestion、question、answer/review 类型；保留 V0.1 类型以兼容旧数据。
- `src/domain/schema.ts`：增加版本化 envelope 和运行结果/来源/引用校验；不要再用 `domain.isMock === true` 约束全部正式工作区。
- `src/domain/seed.ts`、`src/domain/mock-seed.json`：只把已有虚构材料包装为 sample source；不把 seed 的固定 `match`/review 宣称为 live。

### J1：迁移 DeepSeek 核心

- 新增 `src/lib/jobdeck-ai/`，迁入并按当前工程检查 `input`、`prompts`、`output`、`deepseek`、`coach`、`errors`、`http`、`client-guard` 的职责。
- `src/lib/jobdeck-ai/deepseek.*`：服务端 `fetch`、官方域名、Bearer、JSON mode、thinking、超时、错误映射、单请求无 fallback。
- `src/lib/jobdeck-ai/prompts.*`：保留 `PROMPT_VERSION`，四动作共享事实边界，输入材料作为不可信数据。
- `src/lib/jobdeck-ai/output.*`：检查字段、枚举、题数、quote 连续原文、来源归属、当前答案引用和高风险字段。
- `src/lib/jobdeck-ai/client-guard.*`：保持 browser-safe，不把 Node crypto 或环境变量导入客户端。

### J2：新增 Next 服务端入口

- 新增 `src/app/api/coach/route.ts`，只暴露 `POST`，调用 J1 的 HTTP/coach handler。
- 新增 `.env.example` 或更新 README；`.env.local` 加入 `.gitignore`，绝不提交真实 key。
- 在服务端加入本地/部署身份、权限、速率和额度策略；公开部署前不能只依赖同源检查。
- 对当前 GitHub Pages workflow 做架构选择：保留 Pages 仅作无 key 前端，或切换到支持 Node API 的部署；不要把 API route 误放进静态 `out/`。

### J3：补齐 V0.3 持久化与命令

- `src/stores/workspace-store.tsx`：增加 source revision、AI run 记录、latest request、stale/blocked/error 状态和迁移逻辑。
- 为四个 Action 增加命令：保存分析、保存建议、采纳建议为新简历版本、保存动态问题、保存答案和反馈。
- 业务命令继续是唯一写入入口；API 返回不直接 mutate `WorkspaceData`。
- 旧 V0.1 `job-workspace:mock:v1` 读入时迁移或放入显式 legacy namespace；不能静默丢失用户已有简历/投递/面试历史。

### J4：接四个现有 UI 入口

- `src/components/workspace-app.tsx` 的 `AnalysisPanel`：新增 `analyze_job` 请求、缺输入/失败/过期/人工审核状态和要求—证据表。
- `ResumePanel`：将 `tailorResume` 换为 `rewrite_resume`，保留原句、建议、证据、采纳、手动编辑和版本历史。
- `InterviewPanel`：将 `prepareInterview` 换为 `prepare_interview`，动态展示三题及来源；保留面试准备 checklist，但不把它当 AI 结果。
- `MockInterviewPanel`：将正式“提交回答/反馈”改为 `review_answer`；可以保留旧 Mock 结构作为离线测试/legacy，不应作为用户正式结果。
- `TranscriptPanel`：本阶段不新增 ASR/真实转写；如果保留，明确是 legacy 样例功能，避免和 `review_answer` 混淆。
- `RecordsPanel`：显示 run 状态、来源版本、过期/失败、模型元数据和人工确认事件。
- 新增 `src/services/coach-client.ts`：统一构造请求、冻结快照、requestId、abort、response 状态和 `shouldApplyResult`。

### J5：测试与验收

- `tests/unit/`：加入 runtime contract、输出引用、migration、stale guard、localStorage 和命令测试。
- `tests/e2e/workspace.spec.ts`：加入四动作 UI、缺失输入、blocked、同题不同答案、A/B 迟到和刷新持久化测试。
- 增加一个可控延迟 provider stub；禁止通过等待时间或固定文字模拟 live 语义。
- 运行 `npm run lint`、`npm run typecheck`、`npm run test:unit`、`npm run test:e2e`、`npm run build`。
- 配置用户本地 key 后按 D01–D17 和 T01–T11 记录真实证据；没有 key 的测试一律标 NOT_RUN。

### J6：文档和上线前检查

- 更新 `README.md`：Node/API 部署方式、环境变量、材料发送同意、四动作、缺 key/失败行为、重置与数据位置。
- 新增真实运行记录，保留输入 hash、prompt version、模型、completionId、usage 和人工判断；不把真实履历/API key/完整未脱敏输出提交公开仓库。
- 检查前端 bundle、localStorage、Git 历史和截图无 key；公开部署补鉴权、权限、限流、额度和 CORS 策略。
- 明确 GitHub Pages 静态前端与 DeepSeek API 的分离关系，不能宣称当前公开 Pages 已具备真实 AI 后端。

## 当前阶段结论

V0.1 的 UI、状态命令和本地持久化足够作为 V0.3 基础；V0.3 runtime 也足够作为服务端核心参考，但两者目前尚未集成。下一步应先确认上述“API 部署位置”和“schema migration/legacy Mock 数据处理”方案，再开始 J0–J1，而不是重新创建项目或直接把附件 runtime 复制成第二套应用。

**审计完成；按要求停止，不修改代码，等待确认。**
