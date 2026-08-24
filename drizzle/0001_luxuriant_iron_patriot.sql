CREATE TABLE `ai_summaries` (
	`id` varchar(36) NOT NULL,
	`appointmentId` varchar(36) NOT NULL,
	`kind` enum('pre_visit','post_visit') NOT NULL,
	`status` enum('pending','generated','failed') NOT NULL DEFAULT 'pending',
	`provider` varchar(64),
	`isDevelopmentFallback` boolean NOT NULL DEFAULT false,
	`content` json,
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ai_summaries_id` PRIMARY KEY(`id`),
	CONSTRAINT `ai_summary_appointment_kind_unique` UNIQUE(`appointmentId`,`kind`)
);
--> statement-breakpoint
CREATE TABLE `appointments` (
	`id` varchar(36) NOT NULL,
	`doctorId` varchar(36) NOT NULL,
	`patientId` int NOT NULL,
	`slotLockId` varchar(36),
	`startsAt` timestamp NOT NULL,
	`endsAt` timestamp NOT NULL,
	`timezone` varchar(64) NOT NULL,
	`status` enum('confirmed','completed','cancelled_by_patient','cancelled_by_doctor_leave','rescheduled') NOT NULL DEFAULT 'confirmed',
	`cancellationReason` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `appointments_id` PRIMARY KEY(`id`),
	CONSTRAINT `appointments_slotLockId_unique` UNIQUE(`slotLockId`)
);
--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` varchar(36) NOT NULL,
	`actorUserId` int,
	`entityType` varchar(80) NOT NULL,
	`entityId` varchar(64) NOT NULL,
	`action` varchar(120) NOT NULL,
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `calendar_events` (
	`id` varchar(36) NOT NULL,
	`appointmentId` varchar(36) NOT NULL,
	`provider` enum('google') NOT NULL DEFAULT 'google',
	`externalEventId` varchar(255),
	`state` enum('pending','synced','failed','not_configured','cancelled') NOT NULL DEFAULT 'pending',
	`lastError` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `calendar_events_id` PRIMARY KEY(`id`),
	CONSTRAINT `calendar_events_appointmentId_unique` UNIQUE(`appointmentId`)
);
--> statement-breakpoint
CREATE TABLE `clinical_notes` (
	`id` varchar(36) NOT NULL,
	`appointmentId` varchar(36) NOT NULL,
	`doctorId` varchar(36) NOT NULL,
	`assessment` text NOT NULL,
	`plan` text NOT NULL,
	`followUp` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `clinical_notes_id` PRIMARY KEY(`id`),
	CONSTRAINT `clinical_notes_appointmentId_unique` UNIQUE(`appointmentId`)
);
--> statement-breakpoint
CREATE TABLE `doctor_leaves` (
	`id` varchar(36) NOT NULL,
	`doctorId` varchar(36) NOT NULL,
	`startsAt` timestamp NOT NULL,
	`endsAt` timestamp NOT NULL,
	`reason` text,
	`status` enum('preview','confirmed','cancelled') NOT NULL DEFAULT 'preview',
	`affectedCount` int NOT NULL DEFAULT 0,
	`confirmedByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `doctor_leaves_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `doctor_profiles` (
	`id` varchar(36) NOT NULL,
	`userId` int,
	`displayName` varchar(160) NOT NULL,
	`email` varchar(320),
	`specialization` varchar(120) NOT NULL,
	`licenseNumber` varchar(80) NOT NULL,
	`biography` text,
	`timezone` varchar(64) NOT NULL DEFAULT 'UTC',
	`slotDurationMinutes` int NOT NULL DEFAULT 30,
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `doctor_profiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `doctor_profiles_userId_unique` UNIQUE(`userId`),
	CONSTRAINT `doctor_profiles_email_unique` UNIQUE(`email`),
	CONSTRAINT `doctor_profiles_licenseNumber_unique` UNIQUE(`licenseNumber`)
);
--> statement-breakpoint
CREATE TABLE `doctor_working_hours` (
	`id` varchar(36) NOT NULL,
	`doctorId` varchar(36) NOT NULL,
	`weekday` int NOT NULL,
	`startMinute` int NOT NULL,
	`endMinute` int NOT NULL,
	`enabled` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `doctor_working_hours_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `medication_reminders` (
	`id` varchar(36) NOT NULL,
	`patientId` int NOT NULL,
	`prescriptionMedicationId` varchar(36) NOT NULL,
	`scheduledAt` timestamp NOT NULL,
	`state` enum('pending','sent','skipped') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `medication_reminders_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` varchar(36) NOT NULL,
	`recipientUserId` int NOT NULL,
	`appointmentId` varchar(36),
	`type` enum('booking_confirmation','appointment_reminder','cancellation','reschedule','doctor_leave','medication_reminder') NOT NULL,
	`state` enum('pending','sent','retrying','failed') NOT NULL DEFAULT 'pending',
	`attempts` int NOT NULL DEFAULT 0,
	`nextAttemptAt` timestamp,
	`lastError` text,
	`payload` json NOT NULL,
	`idempotencyKey` varchar(190) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`),
	CONSTRAINT `notifications_idempotencyKey_unique` UNIQUE(`idempotencyKey`)
);
--> statement-breakpoint
CREATE TABLE `patient_profiles` (
	`id` varchar(36) NOT NULL,
	`userId` int NOT NULL,
	`phone` varchar(32),
	`dateOfBirth` date,
	`timezone` varchar(64) NOT NULL DEFAULT 'UTC',
	`emergencyContact` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `patient_profiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `patient_profiles_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `prescription_medications` (
	`id` varchar(36) NOT NULL,
	`prescriptionId` varchar(36) NOT NULL,
	`medicationName` varchar(160) NOT NULL,
	`dosage` varchar(120) NOT NULL,
	`frequency` varchar(160) NOT NULL,
	`startsOn` date,
	`endsOn` date,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `prescription_medications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `prescriptions` (
	`id` varchar(36) NOT NULL,
	`appointmentId` varchar(36) NOT NULL,
	`doctorId` varchar(36) NOT NULL,
	`instructions` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `prescriptions_id` PRIMARY KEY(`id`),
	CONSTRAINT `prescriptions_appointmentId_unique` UNIQUE(`appointmentId`)
);
--> statement-breakpoint
CREATE TABLE `slot_locks` (
	`id` varchar(36) NOT NULL,
	`doctorId` varchar(36) NOT NULL,
	`patientId` int NOT NULL,
	`startsAt` timestamp NOT NULL,
	`endsAt` timestamp NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`status` enum('held','booked') NOT NULL DEFAULT 'held',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `slot_locks_id` PRIMARY KEY(`id`),
	CONSTRAINT `slot_lock_doctor_start_unique` UNIQUE(`doctorId`,`startsAt`)
);
--> statement-breakpoint
CREATE TABLE `symptom_submissions` (
	`id` varchar(36) NOT NULL,
	`appointmentId` varchar(36) NOT NULL,
	`patientId` int NOT NULL,
	`symptoms` text NOT NULL,
	`duration` varchar(160),
	`severity` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `symptom_submissions_id` PRIMARY KEY(`id`),
	CONSTRAINT `symptom_submissions_appointmentId_unique` UNIQUE(`appointmentId`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('patient','doctor','admin') NOT NULL DEFAULT 'patient';--> statement-breakpoint
ALTER TABLE `ai_summaries` ADD CONSTRAINT `ai_summaries_appointmentId_appointments_id_fk` FOREIGN KEY (`appointmentId`) REFERENCES `appointments`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `appointments` ADD CONSTRAINT `appointments_doctorId_doctor_profiles_id_fk` FOREIGN KEY (`doctorId`) REFERENCES `doctor_profiles`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `appointments` ADD CONSTRAINT `appointments_patientId_users_id_fk` FOREIGN KEY (`patientId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `appointments` ADD CONSTRAINT `appointments_slotLockId_slot_locks_id_fk` FOREIGN KEY (`slotLockId`) REFERENCES `slot_locks`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_actorUserId_users_id_fk` FOREIGN KEY (`actorUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `calendar_events` ADD CONSTRAINT `calendar_events_appointmentId_appointments_id_fk` FOREIGN KEY (`appointmentId`) REFERENCES `appointments`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `clinical_notes` ADD CONSTRAINT `clinical_notes_appointmentId_appointments_id_fk` FOREIGN KEY (`appointmentId`) REFERENCES `appointments`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `clinical_notes` ADD CONSTRAINT `clinical_notes_doctorId_doctor_profiles_id_fk` FOREIGN KEY (`doctorId`) REFERENCES `doctor_profiles`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `doctor_leaves` ADD CONSTRAINT `doctor_leaves_doctorId_doctor_profiles_id_fk` FOREIGN KEY (`doctorId`) REFERENCES `doctor_profiles`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `doctor_leaves` ADD CONSTRAINT `doctor_leaves_confirmedByUserId_users_id_fk` FOREIGN KEY (`confirmedByUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `doctor_profiles` ADD CONSTRAINT `doctor_profiles_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `doctor_working_hours` ADD CONSTRAINT `doctor_working_hours_doctorId_doctor_profiles_id_fk` FOREIGN KEY (`doctorId`) REFERENCES `doctor_profiles`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `medication_reminders` ADD CONSTRAINT `medication_reminders_patientId_users_id_fk` FOREIGN KEY (`patientId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `medication_reminders` ADD CONSTRAINT `reminder_medication_fk` FOREIGN KEY (`prescriptionMedicationId`) REFERENCES `prescription_medications`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_recipientUserId_users_id_fk` FOREIGN KEY (`recipientUserId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_appointmentId_appointments_id_fk` FOREIGN KEY (`appointmentId`) REFERENCES `appointments`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `patient_profiles` ADD CONSTRAINT `patient_profiles_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `prescription_medications` ADD CONSTRAINT `prescription_medications_prescriptionId_prescriptions_id_fk` FOREIGN KEY (`prescriptionId`) REFERENCES `prescriptions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `prescriptions` ADD CONSTRAINT `prescriptions_appointmentId_appointments_id_fk` FOREIGN KEY (`appointmentId`) REFERENCES `appointments`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `prescriptions` ADD CONSTRAINT `prescriptions_doctorId_doctor_profiles_id_fk` FOREIGN KEY (`doctorId`) REFERENCES `doctor_profiles`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `slot_locks` ADD CONSTRAINT `slot_locks_doctorId_doctor_profiles_id_fk` FOREIGN KEY (`doctorId`) REFERENCES `doctor_profiles`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `slot_locks` ADD CONSTRAINT `slot_locks_patientId_users_id_fk` FOREIGN KEY (`patientId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `symptom_submissions` ADD CONSTRAINT `symptom_submissions_appointmentId_appointments_id_fk` FOREIGN KEY (`appointmentId`) REFERENCES `appointments`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `symptom_submissions` ADD CONSTRAINT `symptom_submissions_patientId_users_id_fk` FOREIGN KEY (`patientId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `appointment_doctor_window_idx` ON `appointments` (`doctorId`,`startsAt`,`status`);--> statement-breakpoint
CREATE INDEX `appointment_patient_start_idx` ON `appointments` (`patientId`,`startsAt`);--> statement-breakpoint
CREATE INDEX `audit_entity_idx` ON `audit_logs` (`entityType`,`entityId`);--> statement-breakpoint
CREATE INDEX `audit_actor_idx` ON `audit_logs` (`actorUserId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `leave_doctor_window_idx` ON `doctor_leaves` (`doctorId`,`startsAt`,`endsAt`);--> statement-breakpoint
CREATE INDEX `doctor_specialization_idx` ON `doctor_profiles` (`specialization`);--> statement-breakpoint
CREATE INDEX `doctor_active_idx` ON `doctor_profiles` (`active`);--> statement-breakpoint
CREATE INDEX `working_hours_doctor_day_idx` ON `doctor_working_hours` (`doctorId`,`weekday`);--> statement-breakpoint
CREATE INDEX `reminder_patient_schedule_idx` ON `medication_reminders` (`patientId`,`scheduledAt`,`state`);--> statement-breakpoint
CREATE INDEX `notification_delivery_idx` ON `notifications` (`state`,`nextAttemptAt`);--> statement-breakpoint
CREATE INDEX `medication_prescription_idx` ON `prescription_medications` (`prescriptionId`);--> statement-breakpoint
CREATE INDEX `slot_lock_expiry_idx` ON `slot_locks` (`status`,`expiresAt`);--> statement-breakpoint
CREATE INDEX `slot_lock_patient_idx` ON `slot_locks` (`patientId`);
