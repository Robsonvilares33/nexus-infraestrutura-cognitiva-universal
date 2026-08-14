CREATE TABLE `collaborationMessages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`userId` int NOT NULL,
	`content` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `collaborationMessages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pluginVerifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`pluginId` int NOT NULL,
	`status` enum('pending','verified','failed') NOT NULL DEFAULT 'pending',
	`checks` text,
	`version` varchar(32),
	`checkedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pluginVerifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `projectCollaborations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`invitedUserId` int NOT NULL,
	`invitedByUserId` int NOT NULL,
	`role` enum('member','contributor') NOT NULL DEFAULT 'member',
	`status` enum('pending','accepted','declined','removed') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`respondedAt` timestamp,
	CONSTRAINT `projectCollaborations_id` PRIMARY KEY(`id`)
);
