-- Reset do D1 LOCAL (nunca rode contra produção).
-- Uso: pnpm --filter @fd/api db:reset:local
-- A ordem respeita as foreign keys; `d1_migrations` é removida para que as
-- migrations sejam aplicadas do zero.

DROP TABLE IF EXISTS budget_category_groups;
DROP TABLE IF EXISTS card_payment_plans;
DROP TABLE IF EXISTS balance_snapshots;
DROP TABLE IF EXISTS transactions;
DROP TABLE IF EXISTS bills;
DROP TABLE IF EXISTS credit_cards;
DROP TABLE IF EXISTS investments;
DROP TABLE IF EXISTS sync_runs;
DROP TABLE IF EXISTS accounts;
DROP TABLE IF EXISTS connections;
DROP TABLE IF EXISTS budget_groups;
DROP TABLE IF EXISTS settings;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS login_attempts;
DROP TABLE IF EXISTS categories;
DROP TABLE IF EXISTS institutions;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS d1_migrations;
