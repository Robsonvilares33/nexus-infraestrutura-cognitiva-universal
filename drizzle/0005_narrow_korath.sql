CREATE TABLE `marketplacePlugins` (
	`id` int AUTO_INCREMENT NOT NULL,
	`authorId` int NOT NULL,
	`name` varchar(128) NOT NULL,
	`category` enum('model','infra','device','utility') NOT NULL,
	`description` text NOT NULL,
	`githubUrl` varchar(512),
	`sourceCode` text,
	`downloads` int NOT NULL DEFAULT 0,
	`upvotes` int NOT NULL DEFAULT 0,
	`version` varchar(32) DEFAULT '1.0.0',
	`isApproved` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `marketplacePlugins_id` PRIMARY KEY(`id`)
);
