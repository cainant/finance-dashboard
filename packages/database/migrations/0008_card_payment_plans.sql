-- Como cada cartão é pago: no vencimento (padrão, sem linha) ou guardando o
-- valor das compras numa reserva (conta ou investimento) ao longo do ciclo.
CREATE TABLE `card_payment_plans` (
	`account_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`mode` text DEFAULT 'pay_on_due' NOT NULL,
	`reserve_account_id` text,
	`reserve_investment_id` text,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reserve_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`reserve_investment_id`) REFERENCES `investments`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `card_payment_plans_user_id_idx` ON `card_payment_plans` (`user_id`);
