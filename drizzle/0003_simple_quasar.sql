CREATE TABLE `calendar_connections` (
	`id` varchar(36) NOT NULL,
	`userId` int NOT NULL,
	`provider` enum('google') NOT NULL DEFAULT 'google',
	`encryptedAccessToken` text NOT NULL,
	`encryptedRefreshToken` text,
	`expiresAt` timestamp,
	`calendarId` varchar(255) NOT NULL DEFAULT 'primary',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `calendar_connections_id` PRIMARY KEY(`id`),
	CONSTRAINT `calendar_connections_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
ALTER TABLE `calendar_events` ADD `operation` enum('create','update','cancel') DEFAULT 'create' NOT NULL;--> statement-breakpoint
ALTER TABLE `calendar_connections` ADD CONSTRAINT `calendar_connections_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;