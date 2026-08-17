CREATE TABLE `lotteryAlerts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`lotteryType` varchar(16) NOT NULL,
	`thresholdBRL` varchar(20) NOT NULL,
	`enabled` int NOT NULL DEFAULT 1,
	`lastNotifiedDraw` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `lotteryAlerts_id` PRIMARY KEY(`id`),
	CONSTRAINT `uniq_alert` UNIQUE(`userId`,`lotteryType`)
);
--> statement-breakpoint
CREATE TABLE `lotteryBets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`lotteryType` varchar(16) NOT NULL,
	`drawNumber` int NOT NULL,
	`numbers` json NOT NULL,
	`hits` int,
	`checked` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `lotteryBets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_user` ON `lotteryBets` (`userId`);--> statement-breakpoint
CREATE INDEX `idx_user_type` ON `lotteryBets` (`userId`,`lotteryType`);