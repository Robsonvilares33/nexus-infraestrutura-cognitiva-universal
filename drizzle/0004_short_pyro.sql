ALTER TABLE `missions` ADD `scheduleCronTaskUid` varchar(65);--> statement-breakpoint
ALTER TABLE `missions` ADD `isScheduled` boolean DEFAULT false NOT NULL;