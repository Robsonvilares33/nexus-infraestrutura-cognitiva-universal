CREATE TABLE `lotteryDraws` (
	`id` int AUTO_INCREMENT NOT NULL,
	`lotteryType` varchar(16) NOT NULL,
	`drawNumber` int NOT NULL,
	`drawDate` varchar(10),
	`numbers` json NOT NULL,
	`accumulatedPrize` varchar(20) DEFAULT '0',
	`estimatedNextPrize` varchar(20) DEFAULT '0',
	`winners` json,
	`collectedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `lotteryDraws_id` PRIMARY KEY(`id`),
	CONSTRAINT `uniq_draw` UNIQUE(`lotteryType`,`drawNumber`)
);
--> statement-breakpoint
CREATE INDEX `idx_type` ON `lotteryDraws` (`lotteryType`);--> statement-breakpoint
CREATE INDEX `idx_draw_number` ON `lotteryDraws` (`drawNumber`);