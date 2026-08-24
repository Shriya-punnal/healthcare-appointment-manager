# API Contract

The scaffold exposes typed tRPC procedures under `/api/trpc`; procedure names below are the public domain contract used by the React application. This maintains compile-time request and response consistency while preserving an API boundary between UI and services.

| Area | Procedure | Access | Purpose |
|---|---|---|---|
| Doctors | `doctors.list`, `doctors.specializations`, `doctors.availability` | Public | Search active doctors and obtain availability inputs. |
| Booking | `appointments.hold`, `appointments.confirm`, `appointments.list`, `appointments.cancel`, `appointments.reschedule` | Patient | Hold, commit, view, cancel, or change a booking. |
| Clinical | `care.patientDashboard`, `care.preVisitSummary` | Patient | View care context and request a validated AI summary. |
| Clinical | `care.doctorDashboard`, `care.clinicalNote`, `care.prescription`, `care.postVisitSummary` | Doctor | View assigned visits and complete clinical workflow. |
| Administration | `admin.dashboard`, `admin.createDoctor`, `admin.updateDoctor`, `admin.assignDoctor`, `admin.setWorkingHours` | Admin | Manage clinical capacity and role assignment. |
| Leave | `admin.previewLeave`, `admin.confirmLeave` | Admin | Review impact before a leave cancellation is committed. |
| Calendar | `calendar.status`, `calendar.authorize` | Doctor or Admin | Check optional integration status and begin OAuth. |

Errors use the tRPC error channel with explicit message codes such as `SLOT_ALREADY_BOOKED`, `SLOT_HOLD_EXPIRED`, `DOCTOR_ON_LEAVE`, `OUTSIDE_WORKING_HOURS`, `FORBIDDEN`, and `NOT_FOUND`. Consumers should treat a slot conflict as a normal recoverable condition and return the patient to availability selection.

The background callback is `POST /api/scheduled/healthcare-reconcile`. It is not a public client endpoint: it authenticates a scheduled-task identity, expires holds, handles reminder records, retries delivery, and processes pending Calendar operations.
