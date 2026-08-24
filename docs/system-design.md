# System Design

Careline is a full-stack appointment and follow-up system built around **authenticated roles**, **persistent booking state**, and isolated external side effects. The existing application scaffold supplies an Express server, typed tRPC procedures, React, Tailwind, a MySQL-compatible relational database, and managed OAuth. The domain layer extends it with patient, doctor, and admin roles.

## Booking integrity

The booking flow treats a selected time as a database resource. A patient first requests a five-minute `slot_locks` record. Before that row is inserted, the service confirms the doctor is active, examines local working hours in the doctor’s declared timezone, rejects past or misaligned times, and rejects confirmed leave. Inside the transaction it checks overlapping active holds and confirmed appointments. The table also has a **unique constraint on `(doctorId, startsAt)`**, so concurrent exact-slot requests race at the database rather than in the browser. One can win; a duplicate-key failure becomes `SLOT_ALREADY_BOOKED` with conflict semantics.

Confirming a booking runs in a transaction. The service verifies that the hold belongs to the signed-in patient, is still `held`, and has not expired; it then inserts the appointment, marks the lock `booked`, and stores the symptom submission. Email and calendar work begin only after the committed transaction, so external outages cannot undo care data. Cancelling an appointment releases its lock and makes its time eligible for future booking.

## Leave conflict handling

An administrator creates a leave **preview** first. The system returns the affected confirmed appointments before any change is made. Confirmation marks those appointments `cancelled_by_doctor_leave`, creates audit evidence, queues patient notifications, and queues calendar cancellation. New booking is prevented because availability and hold validation check confirmed leave windows. Existing appointments are never silently deleted.

## Notifications and scheduled work

Notification intents are persistent records with an idempotency key, delivery state, attempt count, next retry time, and error text. Without configured email credentials, records transition through retry states rather than being reported as sent. The protected periodic reconciliation endpoint expires unconfirmed holds, creates appointment and medication reminder records, retries deliveries with exponential backoff, and processes queued calendar work. The endpoint is intentionally idempotent and only accepts the platform’s scheduled-task identity.

## AI and Calendar boundaries

The LLM service uses schema-validated JSON for pre-visit urgency summaries and post-visit explanations. In local development, malformed output or provider failure produces a clearly labelled development fallback. In production, failure is stored and displayed as unavailable; booking remains successful. Calendar OAuth and calendar event processing are optional. The application records `not_configured` or `failed` states truthfully rather than claiming an integration succeeded.
