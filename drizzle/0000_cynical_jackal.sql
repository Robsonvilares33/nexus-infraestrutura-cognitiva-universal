CREATE TABLE `agents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(64) NOT NULL,
	`status` enum('online','offline','busy') NOT NULL DEFAULT 'offline',
	`currentModel` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `agents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `cognitiveFeed` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`eventType` varchar(64) NOT NULL,
	`message` text NOT NULL,
	`confidence` varchar(10),
	`agentName` varchar(64),
	`missionId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `cognitiveFeed_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `memory` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`content` text NOT NULL,
	`tier` enum('ativa','relevante','historica','arquivada') NOT NULL DEFAULT 'ativa',
	`confidence` varchar(10),
	`origin` varchar(64),
	`tags` varchar(512),
	`accessedAt` datetime,
	`promotedAt` datetime,
	`archivedAt` datetime,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `memory_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `missions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`projectId` int,
	`input` text NOT NULL,
	`status` enum('pending','executing','completed','failed') NOT NULL DEFAULT 'pending',
	`result` text,
	`resultType` varchar(32),
	`confidence` varchar(10),
	`startedAt` datetime,
	`completedAt` datetime,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `missions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `models` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(64) NOT NULL,
	`connected` boolean NOT NULL DEFAULT false,
	`competencyScore` int DEFAULT 0,
	`tasksAssigned` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `models_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `plugins` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(128) NOT NULL,
	`category` enum('model','infra','device') NOT NULL,
	`connected` boolean NOT NULL DEFAULT false,
	`version` varchar(32),
	`permissions` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `plugins_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(256) NOT NULL,
	`description` text,
	`status` enum('active','paused','completed') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `projects_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `universeSettings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`displayName` varchar(256),
	`foundingDate` datetime,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `universeSettings_id` PRIMARY KEY(`id`),
	CONSTRAINT `universeSettings_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`openId` varchar(64) NOT NULL,
	`name` text,
	`email` varchar(320),
	`loginMethod` varchar(64),
	`role` enum('user','admin') NOT NULL DEFAULT 'user',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastSignedIn` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_openId_unique` UNIQUE(`openId`)
);
