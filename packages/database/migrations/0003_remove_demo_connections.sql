-- A demonstração deixou de existir em produção (`ENABLE_DEMO_PROVIDER=false`).
-- Remove conexões demo e, por cascade, contas, cartões, faturas, transações,
-- investimentos, snapshots e sync_runs fictícios. Em desenvolvimento o usuário
-- demo pode reconectar a demonstração quando quiser.
DELETE FROM `connections` WHERE `provider` = 'demo';
