-- MeuPluggy: cada conta pode vir de um banco diferente dentro do mesmo item.
-- `institution_name` guarda o nome do banco derivado dos dados da conta
-- (COMPE em `bankData.transferNumber`, nome do cartão ou conector).
ALTER TABLE `accounts` ADD COLUMN `institution_name` text;
--> statement-breakpoint
-- Consentimento Open Finance (MeuPluggy: 1 ano) exposto pela API e na UI.
ALTER TABLE `connections` ADD COLUMN `consent_expires_at` text;
