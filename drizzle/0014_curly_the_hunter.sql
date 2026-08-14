CREATE TABLE `missionSteps` (
	`id` int AUTO_INCREMENT NOT NULL,
	`missionId` int NOT NULL,
	`stepType` varchar(32) NOT NULL,
	`toolName` varchar(64),
	`agentName` varchar(64),
	`detail` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `missionSteps_id` PRIMARY KEY(`id`)
);
