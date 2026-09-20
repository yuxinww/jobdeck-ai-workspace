import { afterEach, describe, expect, it, vi } from "vitest";
import { CoachError } from "@/lib/jobdeck-ai/errors";
import { runCoach } from "@/lib/jobdeck-ai/coach";

const baseRequest = {
  action: "analyze_job",
  workspaceId: "workspace-1",
  requestId: "request-1",
  jd: { id: "job-1", revision: 1, text: "JD line" },
  candidate: { id: "candidate-1", revision: 1, text: "candidate line" },
  resume: null,
  originalText: "",
  question: null,
  answer: null,
  instruction: "",
  consent: true,
};

const env = { AI_MODE: "live", DEEPSEEK_API_KEY: "test-key", DEEPSEEK_MODEL: "deepseek-flash" };
const providerResponse = (content: unknown) => new Response(JSON.stringify({ id: "completion-1", model: "deepseek-flash", usage: { total_tokens: 10 }, choices: [{ finish_reason: "stop", message: { content: JSON.stringify(content) } }] }), { status: 200, headers: { "content-type": "application/json" } });

afterEach(() => vi.restoreAllMocks());

describe("DeepSeek coach runtime", () => {
  it("returns needs_input without calling the model", async () => {
    const fetchSpy = vi.fn(); vi.stubGlobal("fetch", fetchSpy);
    const response = await runCoach({ ...baseRequest, consent: false, jd: { ...baseRequest.jd, text: "" } }, { env });
    expect(response.status).toBe("needs_input");
    expect(response.meta.modelCalled).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns a validated live result and literal source refs", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => providerResponse({ status: "ready", clarifying_questions: [], warnings: [], result: { requirements: [{ id: "req-1", jd_ref: { id: "J001", quote: "JD line" }, level: "must", candidate_refs: [{ id: "C001", quote: "candidate line" }], relation: "supported", explanation: "证据对应", follow_up: "" }] } })));
    const response = await runCoach(baseRequest, { env });
    expect(response.status).toBe("ready");
    expect(response.meta.modelCalled).toBe(true);
    expect(response.meta.provider).toBe("deepseek");
    expect(response.meta.attempts).toBe(1);
    expect(response.result).toMatchObject({ requirements: [{ jd_ref: { id: "J001", quote: "JD line" } }] });
  });

  it("rejects fabricated source quotes instead of returning a result", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => providerResponse({ status: "ready", clarifying_questions: [], warnings: [], result: { requirements: [{ id: "req-1", jd_ref: { id: "J001", quote: "not in JD" }, level: "must", candidate_refs: [], relation: "unknown", explanation: "不确定", follow_up: "补充材料" }] } })));
    await expect(runCoach(baseRequest, { env })).rejects.toMatchObject({ code: "OUTPUT_VALIDATION_FAILED" });
  });

  it("does not fallback when the provider is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    await expect(runCoach(baseRequest, { env })).rejects.toBeInstanceOf(CoachError);
    await expect(runCoach(baseRequest, { env })).rejects.toMatchObject({ code: "UPSTREAM_NETWORK" });
  });

  it("fails closed when the server key is not configured", async () => {
    const fetchSpy = vi.fn(); vi.stubGlobal("fetch", fetchSpy);
    await expect(runCoach(baseRequest, { env: { AI_MODE: "live" } })).rejects.toMatchObject({ code: "CONFIG_REQUIRED" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
