-- Metas por grupo: cada usuário distribui a renda de referência entre grupos
-- (percentual em pontos-base). Os grupos padrão são criados pela API no
-- primeiro acesso, não aqui: dependem do usuário.
CREATE TABLE `budget_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL,
	`target_bps` integer DEFAULT 0 NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `budget_groups_user_id_idx` ON `budget_groups` (`user_id`);
--> statement-breakpoint
-- Grupo padrão de cada categoria, por usuário.
CREATE TABLE `budget_category_groups` (
	`user_id` text NOT NULL,
	`category_id` text NOT NULL,
	`group_id` text NOT NULL,
	PRIMARY KEY(`user_id`, `category_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`group_id`) REFERENCES `budget_groups`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
-- Parcelas do cartão (Pluggy `creditCardMetadata`). Linhas antigas ficam NULL
-- até o sync revisitar a janela; o histórico completo volta com
-- `accounts.history_synced_at = NULL`.
ALTER TABLE `transactions` ADD COLUMN `installment_number` integer;
--> statement-breakpoint
ALTER TABLE `transactions` ADD COLUMN `total_installments` integer;
--> statement-breakpoint
-- Exceção manual do grupo de metas por transação (NULL = grupo da categoria).
ALTER TABLE `transactions` ADD COLUMN `budget_group_id` text REFERENCES `budget_groups`(`id`) ON DELETE set null;
