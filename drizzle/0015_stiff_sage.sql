CREATE TABLE `superNotes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`content` text NOT NULL,
	`folder` varchar(128) NOT NULL DEFAULT 'Geral',
	`tags` varchar(512),
	`links` varchar(512),
	`source` enum('user','agent') NOT NULL DEFAULT 'user',
	`missionId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `superNotes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `userLlmSettings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`provider` varchar(32) NOT NULL DEFAULT 'forge',
	`model` varchar(128),
	`apiKey` varchar(512),
	`baseUrl` varchar(512),
	`shellEnabled` boolean NOT NULL DEFAULT false,
	`webEnabled` boolean NOT NULL DEFAULT true,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `userLlmSettings_id` PRIMARY KEY(`id`),
	CONSTRAINT `userLlmSettings_userId_unique` UNIQUE(`userId`)
);
