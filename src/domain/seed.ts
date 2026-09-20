import rawSeed from "./mock-seed.json";
import type { ProfileModule, WorkspaceData } from "./types";

export const seedWorkspace = rawSeed as WorkspaceData;

export function createSeedWorkspace(): WorkspaceData {
  const workspace = JSON.parse(JSON.stringify(seedWorkspace)) as WorkspaceData;
  workspace.profile.modules = workspace.profile.modules ?? defaultProfileModules();
  return workspace;
}

function defaultProfileModules(): ProfileModule[] {
  return [
    { id: "profile-module-work", kind: "work", title: "工作经历", content: "2023.07—2025.06，在星桥软件（虚构）任 Python 后端开发工程师；2025.07 起，在青禾工具（虚构）任 AI 应用开发工程师。" },
    { id: "profile-module-education", kind: "education", title: "教育经历", content: "2019.09—2023.06 · 示例大学（虚构）· 计算机科学与技术本科" },
    { id: "profile-module-publication", kind: "publication", title: "已发表成果", content: "暂无已发表成果（演示）" },
    { id: "profile-module-achievement", kind: "achievement", title: "其他成果", content: "搭建 60 条回归样例，检查回答引用、拒答与工具选择行为。" },
    { id: "profile-module-experience", kind: "experience", title: "其他经历", content: "参与企业知识库问答与内部工单助手项目。" },
    { id: "profile-module-intro", kind: "intro", title: "个人介绍", content: "AI 大模型应用工程师，拥有 3 年开发经验，重点实践 RAG、工具调用与可复现评估。" },
  ];
}
