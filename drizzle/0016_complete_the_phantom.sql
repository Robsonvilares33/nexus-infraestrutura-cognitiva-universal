ALTER TABLE `superNotes` ADD `embedding` MEDIUMBLOB;--> statement-breakpoint
ALTER TABLE `superNotes` ADD `embeddingModel` varchar(64);--> statement-breakpoint
ALTER TABLE `superNotes` ADD `embeddingUpdatedAt` timestamp;