import { z } from "zod";
import { invokeLLM } from "../_core/llm";

const preVisitSchema = z.object({
  urgency: z.enum(["Low", "Medium", "High"]),
  chiefComplaint: z.string().min(1),
  suggestedQuestions: z.array(z.string().min(1)).length(3),
});

const postVisitSchema = z.object({
  summary: z.string().min(1),
  medicationSchedule: z.array(z.string()),
  followUpSteps: z.array(z.string()),
});

export type PreVisitSummary = z.infer<typeof preVisitSchema>;
export type PostVisitSummary = z.infer<typeof postVisitSchema>;

function devPreVisitFallback(symptoms: string): PreVisitSummary {
  return {
    urgency: "Medium",
    chiefComplaint: `Development fallback summary for: ${symptoms.slice(0, 140)}`,
    suggestedQuestions: ["When did these symptoms begin?", "What makes the symptoms better or worse?", "Have you noticed any related changes?"],
  };
}

function devPostVisitFallback(notes: string): PostVisitSummary {
  return {
    summary: `Development fallback: your clinician recorded the following plan: ${notes.slice(0, 360)}`,
    medicationSchedule: ["Follow the prescription instructions provided by your clinician."],
    followUpSteps: ["Contact the clinic if symptoms worsen.", "Arrange the recommended follow-up."],
  };
}

async function jsonResponse(messages: { role: "system" | "user"; content: string }[]) {
  const response = await invokeLLM({
    messages,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "healthcare_summary",
        strict: true,
        schema: { type: "object", properties: {}, additionalProperties: true },
      },
    },
  });
  const content = response.choices[0]?.message?.content;
  return JSON.parse(typeof content === "string" ? content : "");
}

export const LLMService = {
  async generatePreVisitSummary(symptoms: string) {
    try {
      const parsed = preVisitSchema.parse(await jsonResponse([
        { role: "system", content: "Return only JSON with urgency (Low, Medium, or High), chiefComplaint, and exactly three suggestedQuestions. Do not diagnose or replace medical advice." },
        { role: "user", content: `Analyse these symptoms and return urgency level, chief complaint, and three suggested questions for the doctor. Symptoms: ${symptoms}` },
      ]));
      return { status: "generated" as const, content: parsed, fallback: false };
    } catch (error) {
      if (process.env.NODE_ENV !== "production") return { status: "generated" as const, content: devPreVisitFallback(symptoms), fallback: true, error: String(error) };
      return { status: "failed" as const, content: null, fallback: false, error: "AI summary is temporarily unavailable." };
    }
  },
  async generatePostVisitSummary(notes: string) {
    try {
      const parsed = postVisitSchema.parse(await jsonResponse([
        { role: "system", content: "Return only JSON with summary, medicationSchedule, and followUpSteps. Use clear, patient-friendly language. Do not add medication not present in notes." },
        { role: "user", content: `Convert these clinical notes into a patient-friendly summary with medication schedule and follow-up steps: ${notes}` },
      ]));
      return { status: "generated" as const, content: parsed, fallback: false };
    } catch (error) {
      if (process.env.NODE_ENV !== "production") return { status: "generated" as const, content: devPostVisitFallback(notes), fallback: true, error: String(error) };
      return { status: "failed" as const, content: null, fallback: false, error: "AI summary is temporarily unavailable." };
    }
  },
};
