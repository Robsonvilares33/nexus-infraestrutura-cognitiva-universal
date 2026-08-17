CREATE TABLE `lotteryCollectJobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`lotteryType` varchar(16) NOT NULL,
	`totalDraws` int NOT NULL DEFAULT 0,
	`collectedDraws` int NOT NULL DEFAULT 0,
	`status` varchar(8) NOT NULL DEFAULT 'running',
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`finishedAt` timestamp,
	`error` text,
	CONSTRAINT `lotteryCollectJobs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `lotteryModels` (
	`id` int AUTO_INCREMENT NOT NULL,
	`lotteryType` varchar(16) NOT NULL,
	`weightsKey` varchar(255),
	`epochs` int NOT NULL DEFAULT 0,
	`finalLoss` varchar(20),
	`lastDrawNumber` int,
	`status` varchar(8) NOT NULL DEFAULT 'training',
	`trainedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `lotteryModels_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_job_type_status` ON `lotteryCollectJobs` (`lotteryType`,`status`);--> statement-breakpoint
CREATE INDEX `idx_model_type` ON `lotteryModels` (`lotteryType`,`status`);