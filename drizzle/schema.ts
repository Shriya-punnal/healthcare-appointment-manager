import { boolean, date, foreignKey, index, int, json, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

const id = (name = "id") => varchar(name, { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID());
const timestamps = {
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
};

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["patient", "doctor", "admin"]).default("patient").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const patientProfiles = mysqlTable("patient_profiles", {
  id: id(),
  userId: int("userId").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  phone: varchar("phone", { length: 32 }),
  dateOfBirth: date("dateOfBirth"),
  timezone: varchar("timezone", { length: 64 }).notNull().default("UTC"),
  emergencyContact: varchar("emergencyContact", { length: 255 }),
  ...timestamps,
});

export const doctorProfiles = mysqlTable("doctor_profiles", {
  id: id(),
  userId: int("userId").unique().references(() => users.id, { onDelete: "set null" }),
  displayName: varchar("displayName", { length: 160 }).notNull(),
  email: varchar("email", { length: 320 }).unique(),
  specialization: varchar("specialization", { length: 120 }).notNull(),
  licenseNumber: varchar("licenseNumber", { length: 80 }).notNull().unique(),
  biography: text("biography"),
  timezone: varchar("timezone", { length: 64 }).notNull().default("UTC"),
  slotDurationMinutes: int("slotDurationMinutes").notNull().default(30),
  active: boolean("active").notNull().default(true),
  ...timestamps,
}, table => [index("doctor_specialization_idx").on(table.specialization), index("doctor_active_idx").on(table.active)]);

export const doctorWorkingHours = mysqlTable("doctor_working_hours", {
  id: id(),
  doctorId: varchar("doctorId", { length: 36 }).notNull().references(() => doctorProfiles.id, { onDelete: "cascade" }),
  weekday: int("weekday").notNull(),
  startMinute: int("startMinute").notNull(),
  endMinute: int("endMinute").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  ...timestamps,
}, table => [index("working_hours_doctor_day_idx").on(table.doctorId, table.weekday)]);

export const doctorLeaves = mysqlTable("doctor_leaves", {
  id: id(),
  doctorId: varchar("doctorId", { length: 36 }).notNull().references(() => doctorProfiles.id, { onDelete: "cascade" }),
  startsAt: timestamp("startsAt").notNull(),
  endsAt: timestamp("endsAt").notNull(),
  reason: text("reason"),
  status: mysqlEnum("status", ["preview", "confirmed", "cancelled"]).notNull().default("preview"),
  affectedCount: int("affectedCount").notNull().default(0),
  confirmedByUserId: int("confirmedByUserId").references(() => users.id, { onDelete: "set null" }),
  ...timestamps,
}, table => [index("leave_doctor_window_idx").on(table.doctorId, table.startsAt, table.endsAt)]);

export const slotLocks = mysqlTable("slot_locks", {
  id: id(),
  doctorId: varchar("doctorId", { length: 36 }).notNull().references(() => doctorProfiles.id, { onDelete: "cascade" }),
  patientId: int("patientId").notNull().references(() => users.id, { onDelete: "cascade" }),
  startsAt: timestamp("startsAt").notNull(),
  endsAt: timestamp("endsAt").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  status: mysqlEnum("status", ["held", "booked"]).notNull().default("held"),
  ...timestamps,
}, table => [
  uniqueIndex("slot_lock_doctor_start_unique").on(table.doctorId, table.startsAt),
  index("slot_lock_expiry_idx").on(table.status, table.expiresAt),
  index("slot_lock_patient_idx").on(table.patientId),
]);

export const appointments = mysqlTable("appointments", {
  id: id(),
  doctorId: varchar("doctorId", { length: 36 }).notNull().references(() => doctorProfiles.id, { onDelete: "restrict" }),
  patientId: int("patientId").notNull().references(() => users.id, { onDelete: "restrict" }),
  slotLockId: varchar("slotLockId", { length: 36 }).unique().references(() => slotLocks.id, { onDelete: "set null" }),
  startsAt: timestamp("startsAt").notNull(),
  endsAt: timestamp("endsAt").notNull(),
  timezone: varchar("timezone", { length: 64 }).notNull(),
  status: mysqlEnum("status", ["confirmed", "completed", "cancelled_by_patient", "cancelled_by_doctor_leave", "rescheduled"]).notNull().default("confirmed"),
  cancellationReason: text("cancellationReason"),
  ...timestamps,
}, table => [
  index("appointment_doctor_window_idx").on(table.doctorId, table.startsAt, table.status),
  index("appointment_patient_start_idx").on(table.patientId, table.startsAt),
]);

export const symptomSubmissions = mysqlTable("symptom_submissions", {
  id: id(),
  appointmentId: varchar("appointmentId", { length: 36 }).notNull().unique().references(() => appointments.id, { onDelete: "cascade" }),
  patientId: int("patientId").notNull().references(() => users.id, { onDelete: "cascade" }),
  symptoms: text("symptoms").notNull(),
  duration: varchar("duration", { length: 160 }),
  severity: int("severity"),
  ...timestamps,
});

export const aiSummaries = mysqlTable("ai_summaries", {
  id: id(),
  appointmentId: varchar("appointmentId", { length: 36 }).notNull().references(() => appointments.id, { onDelete: "cascade" }),
  kind: mysqlEnum("kind", ["pre_visit", "post_visit"]).notNull(),
  status: mysqlEnum("status", ["pending", "generated", "failed"]).notNull().default("pending"),
  provider: varchar("provider", { length: 64 }),
  isDevelopmentFallback: boolean("isDevelopmentFallback").notNull().default(false),
  content: json("content"),
  errorMessage: text("errorMessage"),
  ...timestamps,
}, table => [uniqueIndex("ai_summary_appointment_kind_unique").on(table.appointmentId, table.kind)]);

export const clinicalNotes = mysqlTable("clinical_notes", {
  id: id(),
  appointmentId: varchar("appointmentId", { length: 36 }).notNull().unique().references(() => appointments.id, { onDelete: "cascade" }),
  doctorId: varchar("doctorId", { length: 36 }).notNull().references(() => doctorProfiles.id, { onDelete: "restrict" }),
  assessment: text("assessment").notNull(),
  plan: text("plan").notNull(),
  followUp: text("followUp"),
  ...timestamps,
});

export const prescriptions = mysqlTable("prescriptions", {
  id: id(),
  appointmentId: varchar("appointmentId", { length: 36 }).notNull().unique().references(() => appointments.id, { onDelete: "cascade" }),
  doctorId: varchar("doctorId", { length: 36 }).notNull().references(() => doctorProfiles.id, { onDelete: "restrict" }),
  instructions: text("instructions"),
  ...timestamps,
});

export const prescriptionMedications = mysqlTable("prescription_medications", {
  id: id(),
  prescriptionId: varchar("prescriptionId", { length: 36 }).notNull().references(() => prescriptions.id, { onDelete: "cascade" }),
  medicationName: varchar("medicationName", { length: 160 }).notNull(),
  dosage: varchar("dosage", { length: 120 }).notNull(),
  frequency: varchar("frequency", { length: 160 }).notNull(),
  reminderTime: varchar("reminderTime", { length: 5 }),
  startsOn: date("startsOn"),
  endsOn: date("endsOn"),
  ...timestamps,
}, table => [index("medication_prescription_idx").on(table.prescriptionId)]);

export const medicationReminders = mysqlTable("medication_reminders", {
  id: id(),
  patientId: int("patientId").notNull().references(() => users.id, { onDelete: "cascade" }),
  prescriptionMedicationId: varchar("prescriptionMedicationId", { length: 36 }).notNull(),
  scheduledAt: timestamp("scheduledAt").notNull(),
  state: mysqlEnum("state", ["pending", "sent", "skipped"]).notNull().default("pending"),
  ...timestamps,
}, table => [
  foreignKey({ columns: [table.prescriptionMedicationId], foreignColumns: [prescriptionMedications.id], name: "reminder_medication_fk" }).onDelete("cascade"),
  uniqueIndex("reminder_medication_time_unique").on(table.prescriptionMedicationId, table.scheduledAt),
  index("reminder_patient_schedule_idx").on(table.patientId, table.scheduledAt, table.state),
]);

export const notifications = mysqlTable("notifications", {
  id: id(),
  recipientUserId: int("recipientUserId").notNull().references(() => users.id, { onDelete: "cascade" }),
  appointmentId: varchar("appointmentId", { length: 36 }).references(() => appointments.id, { onDelete: "cascade" }),
  type: mysqlEnum("type", ["booking_confirmation", "appointment_reminder", "cancellation", "reschedule", "doctor_leave", "medication_reminder"]).notNull(),
  state: mysqlEnum("state", ["pending", "sent", "retrying", "failed"]).notNull().default("pending"),
  attempts: int("attempts").notNull().default(0),
  nextAttemptAt: timestamp("nextAttemptAt"),
  lastError: text("lastError"),
  payload: json("payload").notNull(),
  idempotencyKey: varchar("idempotencyKey", { length: 190 }).notNull().unique(),
  ...timestamps,
}, table => [index("notification_delivery_idx").on(table.state, table.nextAttemptAt)]);

export const calendarEvents = mysqlTable("calendar_events", {
  id: id(),
  appointmentId: varchar("appointmentId", { length: 36 }).notNull().unique().references(() => appointments.id, { onDelete: "cascade" }),
  provider: mysqlEnum("provider", ["google"]).notNull().default("google"),
  operation: mysqlEnum("operation", ["create", "update", "cancel"]).notNull().default("create"),
  externalEventId: varchar("externalEventId", { length: 255 }),
  state: mysqlEnum("state", ["pending", "synced", "failed", "not_configured", "cancelled"]).notNull().default("pending"),
  lastError: text("lastError"),
  ...timestamps,
});

export const calendarConnections = mysqlTable("calendar_connections", {
  id: id(),
  userId: int("userId").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  provider: mysqlEnum("provider", ["google"]).notNull().default("google"),
  encryptedAccessToken: text("encryptedAccessToken").notNull(),
  encryptedRefreshToken: text("encryptedRefreshToken"),
  expiresAt: timestamp("expiresAt"),
  calendarId: varchar("calendarId", { length: 255 }).notNull().default("primary"),
  ...timestamps,
});

export const auditLogs = mysqlTable("audit_logs", {
  id: id(),
  actorUserId: int("actorUserId").references(() => users.id, { onDelete: "set null" }),
  entityType: varchar("entityType", { length: 80 }).notNull(),
  entityId: varchar("entityId", { length: 64 }).notNull(),
  action: varchar("action", { length: 120 }).notNull(),
  metadata: json("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("audit_entity_idx").on(table.entityType, table.entityId), index("audit_actor_idx").on(table.actorUserId, table.createdAt)]);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Appointment = typeof appointments.$inferSelect;
export type DoctorProfile = typeof doctorProfiles.$inferSelect;
