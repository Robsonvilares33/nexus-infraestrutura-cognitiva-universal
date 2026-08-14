CREATE TABLE `missionTemplates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(255) NOT NULL,
	`description` text NOT NULL,
	`suggestedInput` text NOT NULL,
	`agents` varchar(255) NOT NULL DEFAULT '',
	`category` varchar(64) NOT NULL DEFAULT 'geral',
	`icon` varchar(32) NOT NULL DEFAULT 'Zap',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `missionTemplates_id` PRIMARY KEY(`id`)
);
