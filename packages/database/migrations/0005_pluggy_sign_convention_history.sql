-- Cartão: convenção de sinal detectada por conta (sandbox usa compras
-- negativas; documentação/Open Finance usa compras positivas).
ALTER TABLE `accounts` ADD COLUMN `amount_sign_convention` text;
--> statement-breakpoint
-- Primeiro sync de cada conta: histórico completo só é considerado importado
-- quando esta data é gravada (cursor pendente mantém NULL).
ALTER TABLE `accounts` ADD COLUMN `history_synced_at` text;
--> statement-breakpoint
-- Conexões criadas antes desta correção herdavam `last_synced_at` do item e
-- pulavam o histórico. Quem nunca teve sync com sucesso volta a ser inicial.
UPDATE `connections`
SET `last_synced_at` = NULL
WHERE `id` NOT IN (SELECT `connection_id` FROM `sync_runs` WHERE `status` = 'success');
