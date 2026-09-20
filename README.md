# JobDeck · AI 求职工作台 v0.3

JobDeck 在 V0.1 求职看板基础上接入 DeepSeek live AI。岗位卡片、看板状态、岗位专属简历、投递记录、面试轮次和档案模块继续复用原有工作区；V0.1 的固定岗位与旧样例只作为演示数据，不作为四个正式 AI Action 的结果来源。

## 本地启动

```bash
npm install
cp .env.example .env.local
# 编辑 .env.local，填写服务端 DEEPSEEK_API_KEY
npm run dev
```

打开 `http://127.0.0.1:3000/board`。API Key 只由 Next.js Node 服务读取，不能放入 `NEXT_PUBLIC_*` 或浏览器代码。

也可以点击页面顶部“配置 API”按钮输入 Key。该方式只保存在当前 Node 进程内，服务重启后需要重新配置；生产环境建议使用服务端环境变量。

## 四个正式 AI Action

- `analyze_job`：逐项分析 JD 要求与候选人证据。
- `rewrite_resume`：基于原始段落生成待人工确认的改写建议。
- `prepare_interview`：生成至少三道带 JD/候选人依据的问题。
- `review_answer`：只评价当前问题与当前回答，并返回引用、改进示例和追问。

每次运行都会记录 request ID、输入版本/hash、prompt 版本、模型调用状态、验证状态和结果。材料不足会返回 `needs_input`，明确捏造请求会返回 `blocked`；DeepSeek 失败时不会 fallback 到 Mock。

左下角的“AI 聊天”按钮提供独立的 DeepSeek 对话窗口；聊天内容只在当前页面内存中保留，不写入工作区快照。

## 测试与构建

```bash
npm run lint
npm run typecheck
npm run test:unit
npm run test:e2e
npm run build
```

Playwright 首次使用需要安装浏览器：`npx playwright install chromium`。

## GitHub Pages 限制

GitHub Pages 继续用于发布静态前端演示页面；它不能安全托管本项目的 Node API，也不应存放 DeepSeek Key。因此 Pages 页面可以浏览看板和 UI，但要使用 live AI，需要在本地或支持 Node 服务端路由的平台运行同一工程，并配置 `.env.local`。

## 数据与边界

浏览器持久化键仍为 `job-workspace:mock:v1`，以兼容 V0.1 的单一工作区快照；新增 `aiRuns` 用于保存 live 运行记录。修改档案或简历版本会将已有相关 AI 结果标记为 stale。应用不会抓取岗位、自动投递、调用邮箱/日历、请求麦克风或执行语音转写。

详细架构审计见 [`docs/V03_IMPLEMENTATION_AUDIT.md`](docs/V03_IMPLEMENTATION_AUDIT.md)。
