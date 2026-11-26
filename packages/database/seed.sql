-- Seed local idempotente do Finance Dashboard (somente ambiente local).
--
-- Usuário demo: demo@finance.local / demo1234
-- Hash PBKDF2-SHA256 com 100.000 iterações e salt fixo, reproduzível com:
--   node scripts/hash-password.mjs demo1234 100000 "rym1KmLHTiFMx+oUWGVxCg=="
--
-- Categorias de sistema têm user_id NULL e id estável `cat_<slug>`.
-- Contas, conexões, instituições e transações NÃO são semeadas: o provider
-- demo as cria via sincronização.

INSERT OR IGNORE INTO users (id, email, name, password_hash, github_login, avatar_url, created_at)
VALUES (
  '11111111-1111-4111-8111-111111111111',
  'demo@finance.local',
  'Demo',
  'pbkdf2$100000$rym1KmLHTiFMx+oUWGVxCg==$9W5BgFTu4tFjcSDdBkHnOENRI5Cm74TdXWecD9MbKEw=',
  NULL,
  NULL,
  '2026-11-10T00:00:00.000Z'
);

INSERT OR IGNORE INTO categories (id, user_id, name, slug, icon, color, kind, parent_id) VALUES
  ('cat_mercado', NULL, 'Mercado', 'mercado', 'ShoppingCart', '#22c55e', 'expense', NULL),
  ('cat_restaurantes', NULL, 'Restaurantes', 'restaurantes', 'UtensilsCrossed', '#f97316', 'expense', NULL),
  ('cat_transporte', NULL, 'Transporte', 'transporte', 'Car', '#3b82f6', 'expense', NULL),
  ('cat_moradia', NULL, 'Moradia', 'moradia', 'House', '#8b5cf6', 'expense', NULL),
  ('cat_contas-e-servicos', NULL, 'Contas & Serviços', 'contas-e-servicos', 'ReceiptText', '#06b6d4', 'expense', NULL),
  ('cat_saude', NULL, 'Saúde', 'saude', 'HeartPulse', '#ef4444', 'expense', NULL),
  ('cat_educacao', NULL, 'Educação', 'educacao', 'GraduationCap', '#6366f1', 'expense', NULL),
  ('cat_lazer', NULL, 'Lazer', 'lazer', 'Gamepad2', '#ec4899', 'expense', NULL),
  ('cat_compras', NULL, 'Compras', 'compras', 'ShoppingBag', '#f59e0b', 'expense', NULL),
  ('cat_assinaturas', NULL, 'Assinaturas', 'assinaturas', 'Repeat', '#a855f7', 'expense', NULL),
  ('cat_viagem', NULL, 'Viagem', 'viagem', 'Plane', '#14b8a6', 'expense', NULL),
  ('cat_pets', NULL, 'Pets', 'pets', 'PawPrint', '#84cc16', 'expense', NULL),
  ('cat_impostos-e-taxas', NULL, 'Impostos & Taxas', 'impostos-e-taxas', 'Landmark', '#64748b', 'expense', NULL),
  ('cat_transferencias', NULL, 'Transferências', 'transferencias', 'ArrowLeftRight', '#94a3b8', 'transfer', NULL),
  ('cat_salario', NULL, 'Salário', 'salario', 'Wallet', '#10b981', 'income', NULL),
  ('cat_freelance', NULL, 'Freelance', 'freelance', 'Briefcase', '#0ea5e9', 'income', NULL),
  ('cat_rendimentos', NULL, 'Rendimentos', 'rendimentos', 'TrendingUp', '#eab308', 'income', NULL),
  ('cat_pix-recebido', NULL, 'Pix recebido', 'pix-recebido', 'QrCode', '#2dd4bf', 'income', NULL),
  ('cat_outros', NULL, 'Outros', 'outros', 'CircleEllipsis', '#71717a', 'expense', NULL);
