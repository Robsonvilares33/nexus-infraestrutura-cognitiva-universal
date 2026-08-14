CREATE TABLE `suggestedCategories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(64) NOT NULL,
	`suggestedByUserId` int NOT NULL,
	`upvotes` int NOT NULL DEFAULT 0,
	`isApproved` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `suggestedCategories_id` PRIMARY KEY(`id`)
);
