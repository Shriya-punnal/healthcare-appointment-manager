import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ invokeLLM: vi.fn() }));
vi.mock("../_core/llm", () => ({ invokeLLM: mocks.invokeLLM }));
import { LLMService } from "./llmSummary";

describe("LLM summary failure isolation", () => {
  beforeEach(() => mocks.invokeLLM.mockReset());

  it("validates a structured pre-visit response", async () => {
    mocks.invokeLLM.mockResolvedValue({ choices: [{ message: { content: JSON.stringify({ urgency: "High", chiefComplaint: "Persistent chest discomfort", suggestedQuestions: ["When did it start?", "Is it related to exertion?", "Are there accompanying symptoms?"] }) } }] });
    const result = await LLMService.generatePreVisitSummary("Chest discomfort after walking");
    expect(result).toMatchObject({ status: "generated", fallback: false, content: { urgency: "High" } });
  });

  it("uses an explicitly labelled local fallback for malformed provider output in development", async () => {
    mocks.invokeLLM.mockResolvedValue({ choices: [{ message: { content: "not JSON" } }] });
    const result = await LLMService.generatePreVisitSummary("Intermittent headache");
    expect(result.fallback).toBe(true);
    expect(result.content?.chiefComplaint).toContain("Development fallback");
  });
});
