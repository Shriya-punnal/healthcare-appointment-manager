# LLM Design and Failure Handling

The application isolates AI from all booking transactions. A pre-visit summary is attempted only after symptoms and the appointment have committed, and a post-visit summary is generated only after a doctor has saved clinical notes. Outputs are persisted in `ai_summaries` with `pending`, `generated`, or `failed` state. A persistence problem with the AI record is logged but never reverses the already-confirmed appointment.

## Pre-visit contract

> Analyse these symptoms and return urgency level, chief complaint, and three suggested questions for the doctor.

The expected JSON schema has an urgency enum of `Low`, `Medium`, or `High`, a non-empty `chiefComplaint`, and exactly three non-empty `suggestedQuestions`. The output is clinical context for a professional, not a diagnosis or emergency triage replacement.

## Post-visit contract

> Convert these clinical notes into a patient-friendly summary with medication schedule and follow-up steps.

The expected response contains a non-empty explanatory summary plus arrays for medication schedule and follow-up steps. The prompt explicitly prohibits adding medication that does not appear in the clinician’s notes.

## Resilience

Provider timeouts, missing credentials, malformed JSON, and network errors are caught at the service boundary. In development, the product returns a visibly labelled **development fallback** to make local UX testable without misrepresenting it as AI output. In production, it stores a failed state and the UI can state that the AI summary is temporarily unavailable. Neither path interrupts an already committed appointment or clinical record.
