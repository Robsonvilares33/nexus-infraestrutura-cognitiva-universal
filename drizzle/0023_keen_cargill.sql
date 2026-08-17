CREATE TABLE `lotteryPortfolioEvolution` (
	`id` int AUTO_INCREMENT NOT NULL,
	`portfolioId` int NOT NULL,
	`drawNumber` int NOT NULL,
	`bestHits` int NOT NULL DEFAULT 0,
	`hitsDist` json DEFAULT ('null'),
	`hits13Plus` int NOT NULL DEFAULT 0,
	`hits14` int NOT NULL DEFAULT 0,
	`hits15` int NOT NULL DEFAULT 0,
	`weightsSnapshot` json DEFAULT ('null'),
	`checkedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `lotteryPortfolioEvolution_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `lotteryPortfolios` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` varchar(64) NOT NULL,
	`lotteryType` varchar(16) NOT NULL,
	`targetNumbers` json NOT NULL,
	`games` json NOT NULL,
	`cognitiveWeights` json DEFAULT ('null'),
	`evolutionSeed` int NOT NULL DEFAULT 0,
	`lastDrawChecked` int DEFAULT null,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `lotteryPortfolios_id` PRIMARY KEY(`id`),
	CONSTRAINT `uniq_portfolio_user_type` UNIQUE(`userId`,`lotteryType`)
);
--> statement-breakpoint
CREATE INDEX `idx_evolution_portfolio` ON `lotteryPortfolioEvolution` (`portfolioId`);