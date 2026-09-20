# JobDeck · AI 求职工作台 v0.1 Mock MVP

这是一个面向“AI 大模型应用工程师”求职场景的本地 Mock MVP。它围绕岗位卡片组织岗位分析、岗位专属简历、手动投递记录、面试准备、文字模拟和样例复盘；所有岗位、人物、公司和 AI 结果均为虚构演示数据。

## 启动

```bash
npm install
npm run dev
```

打开 `http://localhost:3000`。根路径会进入“求职看板”。一级入口只有求职看板、岗位发现、简历中心、我的档案。

## 测试与构建

```bash
npm run lint
npm run typecheck
npm run test:unit
npm run test:e2e
npm run build
```

Playwright 首次使用需要安装浏览器：`npx playwright install chromium`。

## 演示路径

1. 在岗位发现搜索“知识库”，查看推荐理由和证据，加入看板；重复加入不会产生第二张卡。
2. 打开新发现卡片，进入简历 Tab，生成 Mock 草稿，人工编辑、采纳建议并保存版本。
3. 用卡片菜单或拖动进入已投递，确认外部已手动投递、渠道、时间和简历版本；本应用不会发送申请。
4. 进入面试 Tab，新增轮次、勾选准备任务、开始文字模拟并观察针对评估样本/幂等的规则追问。
5. 在已有面试轮次导入样例转写，修改片段后生成带引用的模拟复盘；修改会让旧复盘过期。
6. 刷新页面，从简历中心重新打开岗位，确认同一份岗位简历和时间线仍然存在。

## 数据与重置

初始化数据来自 `doc/ai_job_workspace_handoff/data/mock-seed.json`。浏览器持久化键为 `job-workspace:mock:v1`，保存的是带 `schemaVersion`、`revision` 和完整 domain 的单一 JSON 快照。顶部“重置 Demo”会二次确认并恢复固定 seed。

## 已实现的边界

- AI Provider 是本地规则/模板 Mock，具有加载、结果、模拟失败和重试状态；不会直接修改业务状态。
- 不调用招聘网站、外部模型、邮箱、日历或 ASR，不请求麦克风权限。
- 一张岗位卡只有一个岗位简历容器，保存简历会产生不可变版本；投递记录引用版本快照。
- 面试、模拟会话、转写和复盘均以岗位 ID/轮次 ID 归属，不设独立面试中心。

详细的真实测试结果、阶段状态和限制见 `reports/`。
