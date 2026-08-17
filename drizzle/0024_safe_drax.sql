ALTER TABLE `lotteryPortfolioEvolution` MODIFY COLUMN `hitsDist` json;--> statement-breakpoint
ALTER TABLE `lotteryPortfolioEvolution` MODIFY COLUMN `weightsSnapshot` json;--> statement-breakpoint
ALTER TABLE `lotteryPortfolios` MODIFY COLUMN `userId` int NOT NULL;--> statement-breakpoint
ALTER TABLE `lotteryPortfolios` MODIFY COLUMN `cognitiveWeights` json;