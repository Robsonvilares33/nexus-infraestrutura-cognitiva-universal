CREATE TABLE `webhookEvents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`missionId` int NOT NULL,
	`webhookId` int NOT NULL,
	`result` enum('sucesso','falha','timeout','teste') NOT NULL DEFAULT 'falha',
	`httpStatus` int DEFAULT 0,
	`elapsedMs` int DEFAULT 0,
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `webhookEvents_id` PRIMARY KEY(`id`)
);
