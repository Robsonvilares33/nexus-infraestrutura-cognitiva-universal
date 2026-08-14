CREATE TABLE `projectShares` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`sharedUserId` int NOT NULL,
	`sharedByUserId` int NOT NULL,
	`permission` enum('view','edit','admin') NOT NULL DEFAULT 'view',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `projectShares_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `agents` MODIFY COLUMN `status` varchar(32) NOT NULL DEFAULT 'offline';--> statement-breakpoint
ALTER TABLE `agents` ADD `specialization` varchar(32) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `agents` ADD `hue` varchar(16);--> statement-breakpoint
ALTER TABLE `agents` ADD `updatedAt` timestamp DEFAULT (now()) NOT NULL ON UPDATE CURRENT_TIMESTAMP;