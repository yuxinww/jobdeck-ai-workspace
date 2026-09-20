import { expect, test } from "@playwright/test";

test("首页显示六列看板和四个一级入口", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/board$/);
  await expect(page.getByRole("heading", { name: "求职看板" })).toBeVisible();
  await expect(page.locator(".stage-title").filter({ hasText: /^面试准备$/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "求职看板" })).toBeVisible();
  await expect(page.getByRole("link", { name: "岗位发现" })).toBeVisible();
  await expect(page.getByRole("link", { name: "简历中心" })).toBeVisible();
  await expect(page.getByRole("link", { name: "我的档案" })).toBeVisible();
});

test("岗位发现加入岗位后只生成一张卡片", async ({ page }) => {
  await page.goto("/discover");
  const job = page.locator(".discover-card").filter({ hasText: "知识库应用工程师" }).first();
  await job.getByRole("button", { name: "加入看板" }).click();
  await expect(job.getByRole("button", { name: /已加入/ })).toBeVisible();
  await job.getByRole("button", { name: /已加入/ }).click();
  await expect(page.getByRole("heading", { name: "知识库应用工程师" })).toBeVisible();
});

test("生成验收截图：看板、分析、简历、面试与发现", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/board");
  await page.screenshot({ path: "reports/screenshots/01-board.png", fullPage: true });
  await page.locator(".job-card").first().click();
  await page.screenshot({ path: "reports/screenshots/02-analysis.png", fullPage: true });
  await page.getByRole("button", { name: "简历", exact: true }).click();
  await page.screenshot({ path: "reports/screenshots/03-resume.png", fullPage: true });
  await page.getByRole("button", { name: "面试", exact: true }).click();
  await page.screenshot({ path: "reports/screenshots/04-interview.png", fullPage: true });
  await page.goto("/discover");
  await page.screenshot({ path: "reports/screenshots/05-discover.png", fullPage: true });
});

test("我的档案支持截图中的模块新增与编辑", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/profile");
  for (const label of ["工作经历", "教育经历", "已发表成果", "其他成果", "其他经历", "个人介绍"]) {
    await expect(page.getByText(label, { exact: true })).toBeVisible();
  }
  await page.getByRole("button", { name: /项目经历/ }).click();
  await expect(page.getByRole("heading", { name: "添加档案模块" })).toBeVisible();
  await page.getByLabel("模块内容").fill("企业知识库问答项目：混合检索、Rerank 与答案引用。");
  await page.getByRole("button", { name: "保存模块" }).click();
  await expect(page.locator(".profile-module-row").filter({ hasText: "项目经历" })).toBeVisible();
  await expect(page.getByText("企业知识库问答项目：混合检索、Rerank 与答案引用。", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("企业知识库问答项目：混合检索、Rerank 与答案引用。", { exact: true })).toBeVisible();
  await page.screenshot({ path: "reports/screenshots/06-profile-modules.png", fullPage: true });
});
