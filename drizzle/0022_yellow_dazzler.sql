CREATE TABLE `lotteryWarmupEvents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`lotteryType` varchar(16) NOT NULL,
	`number` int NOT NULL,
	`freq30` int NOT NULL DEFAULT 0,
	`freq90` int NOT NULL DEFAULT 0,
	`deltaFactor` varchar(20) NOT NULL DEFAULT '0',
	`detectedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `lotteryWarmupEvents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_warmup_type` ON `lotteryWarmupEvents` (`lotteryType`);--> statement-breakpoint
CREATE INDEX `idx_warmup_detected` ON `lotteryWarmupEvents` (`detectedAt`);