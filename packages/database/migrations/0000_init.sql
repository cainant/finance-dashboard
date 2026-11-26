CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`connection_id` text NOT NULL,
	`external_id` text NOT NULL,
	`type` text NOT NULL,
	`subtype` text,
	`name` text NOT NULL,
	`number_masked` text,
	`currency` text DEFAULT 'BRL' NOT NULL,
	`balance_cents` integer NOT NULL,
	`available_cents` integer,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`connection_id`) REFERENCES `connections`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_connection_external_id_unique` ON `accounts` (`connection_id`,`external_id`);--> statement-breakpoint
CREATE TABLE `balance_snapshots` (
	`account_id` text NOT NULL,
	`date` text NOT NULL,
	`balance_cents` integer NOT NULL,
	PRIMARY KEY(`account_id`, `date`),
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `bills` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`external_id` text NOT NULL,
	`due_date` text NOT NULL,
	`closing_date` text,
	`total_cents` integer NOT NULL,
	`minimum_payment_cents` integer,
	`status` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bills_account_external_id_unique` ON `bills` (`account_id`,`external_id`);--> statement-breakpoint
CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`icon` text NOT NULL,
	`color` text NOT NULL,
	`kind` text NOT NULL,
	`parent_id` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parent_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `connections` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`provider` text NOT NULL,
	`external_id` text NOT NULL,
	`institution_id` text,
	`status` text NOT NULL,
	`status_detail` text,
	`last_synced_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `credit_cards` (
	`account_id` text PRIMARY KEY NOT NULL,
	`brand` text,
	`level` text,
	`limit_cents` integer,
	`available_limit_cents` integer,
	`closing_day` integer,
	`due_day` integer,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `institutions` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`external_id` text NOT NULL,
	`name` text NOT NULL,
	`logo_url` text,
	`primary_color` text,
	`type` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `institutions_provider_external_id_unique` ON `institutions` (`provider`,`external_id`);--> statement-breakpoint
CREATE TABLE `investments` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`connection_id` text NOT NULL,
	`external_id` text NOT NULL,
	`type` text NOT NULL,
	`name` text NOT NULL,
	`balance_cents` integer NOT NULL,
	`amount_profit_cents` integer,
	`currency` text DEFAULT 'BRL' NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`connection_id`) REFERENCES `connections`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `investments_connection_external_id_unique` ON `investments` (`connection_id`,`external_id`);--> statement-breakpoint
CREATE TABLE `login_attempts` (
	`key` text NOT NULL,
	`attempted_at` text NOT NULL,
	PRIMARY KEY(`key`, `attempted_at`)
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL,
	`user_agent` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`user_id` text NOT NULL,
	`key` text NOT NULL,
	`value_json` text NOT NULL,
	PRIMARY KEY(`user_id`, `key`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sync_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`connection_id` text NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text,
	`status` text NOT NULL,
	`error_code` text,
	`error_message` text,
	`stats_json` text,
	FOREIGN KEY (`connection_id`) REFERENCES `connections`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`account_id` text NOT NULL,
	`connection_id` text NOT NULL,
	`external_id` text NOT NULL,
	`date` text NOT NULL,
	`description` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`currency` text DEFAULT 'BRL' NOT NULL,
	`type` text NOT NULL,
	`category_id` text,
	`status` text NOT NULL,
	`bill_id` text,
	`merchant` text,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`connection_id`) REFERENCES `connections`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`bill_id`) REFERENCES `bills`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `transactions_account_external_id_unique` ON `transactions` (`account_id`,`external_id`);--> statement-breakpoint
CREATE INDEX `transactions_user_id_date_idx` ON `transactions` (`user_id`,`date`);--> statement-breakpoint
CREATE INDEX `transactions_account_id_date_idx` ON `transactions` (`account_id`,`date`);--> statement-breakpoint
CREATE INDEX `transactions_category_id_idx` ON `transactions` (`category_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`password_hash` text,
	`github_login` text,
	`avatar_url` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_github_login_unique` ON `users` (`github_login`);