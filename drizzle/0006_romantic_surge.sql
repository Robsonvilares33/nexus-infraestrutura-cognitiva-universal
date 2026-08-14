CREATE TABLE `marketplaceInstalls` (
	`id` int AUTO_INCREMENT NOT NULL,
	`pluginId` int NOT NULL,
	`userId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `marketplaceInstalls_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `marketplaceReviews` (
	`id` int AUTO_INCREMENT NOT NULL,
	`pluginId` int NOT NULL,
	`userId` int NOT NULL,
	`rating` int NOT NULL,
	`comment` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `marketplaceReviews_id` PRIMARY KEY(`id`)
);
