-- Frescor do dado no provider (Pluggy: `Item.lastUpdatedAt`) separado da hora
-- da leitura local (`last_synced_at`). A janela incremental usa o menor dos
-- dois para não perder transação retroativa quando o MeuPluggy fica dias sem
-- atualizar e depois despeja o extrato de uma vez.
ALTER TABLE `connections` ADD COLUMN `provider_updated_at` text;
