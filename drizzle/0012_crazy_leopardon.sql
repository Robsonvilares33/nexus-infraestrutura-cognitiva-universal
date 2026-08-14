CREATE TABLE `pluginThreads` (
	`id` int AUTO_INCREMENT NOT NULL,
	`pluginId` int NOT NULL,
	`authorId` int NOT NULL,
	`parentId` int,
	`content` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pluginThreads_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `xp_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`source` enum('plugin_publish','review','mission_complete','collab_accept') NOT NULL,
	`xp` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `xp_events_id` PRIMARY KEY(`id`)
);
