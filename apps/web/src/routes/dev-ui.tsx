import type {
  Category,
  CategoryBreakdownItem,
  MonthlySummary,
  NetWorthPoint,
  Transaction,
} from "@fd/contracts";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  CalendarRange,
  Check,
  ChevronDown,
  Inbox,
  Landmark,
  MoreHorizontal,
  Palette,
  Plus,
  Sparkles,
} from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";

import { CategoryDonut } from "@/components/charts/category-donut";
import { ChartEmpty } from "@/components/charts/chart-empty";
import { IncomeExpenseBarChart } from "@/components/charts/income-expense-bar-chart";
import { NetWorthAreaChart } from "@/components/charts/net-worth-area-chart";
import { ChartCard } from "@/components/domain/chart-card";
import { DeltaBadge } from "@/components/domain/delta-badge";
import { DemoBadge } from "@/components/domain/demo-badge";
import { EmptyState } from "@/components/domain/empty-state";
import { ErrorState } from "@/components/domain/error-state";
import { FormField } from "@/components/domain/form-field";
import { InstitutionAvatar } from "@/components/domain/institution-avatar";
import { KpiCard } from "@/components/domain/kpi-card";
import { MoneyText } from "@/components/domain/money-text";
import { PageHeader } from "@/components/domain/page-header";
import { StatusDot } from "@/components/domain/status-dot";
import { TransactionList } from "@/components/domain/transaction-list";
import { BrandLogo } from "@/components/layout/brand";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/dev-ui")({
  component: ShowcasePage,
});

const COLOR_TOKENS = [
  { name: "Background", token: "--background", className: "bg-background" },
  { name: "Card", token: "--card", className: "bg-card" },
  { name: "Surface 2", token: "--surface-2", className: "bg-surface-2" },
  { name: "Muted", token: "--muted", className: "bg-muted" },
  { name: "Border", token: "--border", className: "bg-border" },
  { name: "Border subtle", token: "--border-subtle", className: "bg-border-subtle" },
  { name: "Primary", token: "--primary", className: "bg-primary" },
  { name: "Positive", token: "--positive", className: "bg-positive" },
  { name: "Negative", token: "--negative", className: "bg-negative" },
  { name: "Warning", token: "--warning", className: "bg-warning" },
  { name: "Info", token: "--info", className: "bg-info" },
  { name: "Chart 1", token: "--chart-1", className: "bg-chart-1" },
  { name: "Chart 2", token: "--chart-2", className: "bg-chart-2" },
  { name: "Chart 3", token: "--chart-3", className: "bg-chart-3" },
  { name: "Chart 4", token: "--chart-4", className: "bg-chart-4" },
  { name: "Chart 5", token: "--chart-5", className: "bg-chart-5" },
] as const;

const TYPE_SCALE = [
  { token: "12px", use: "Rótulos, metadados, pills", className: "text-xs" },
  { token: "13px", use: "Sidebar, cabeçalho de tabela, botão pequeno", className: "text-[13px]" },
  { token: "14px", use: "Corpo, células, botões, abas", className: "text-sm" },
  { token: "16px", use: "Título de card grande", className: "text-base" },
  { token: "20px/28px", use: "Título de página (600)", className: "text-xl font-semibold" },
  { token: "24px/32px", use: "Valor de KPI (600)", className: "text-2xl font-semibold" },
] as const;

const CONTROL_HEIGHTS = [
  { token: "28px", use: "Ícone compacto / botão pequeno", className: "h-7" },
  { token: "32px", use: "Botão pequeno, abas, busca rápida", className: "h-8" },
  { token: "36px", use: "Controle padrão (botão, input)", className: "h-9" },
  { token: "44px", use: "Linha de tabela / cabeçalho de card", className: "h-11" },
] as const;

const NET_WORTH: NetWorthPoint[] = [
  {
    date: "2026-01-01",
    assetsCents: 20_100_000,
    liabilitiesCents: 2_400_000,
    netWorthCents: 17_700_000,
  },
  {
    date: "2026-02-01",
    assetsCents: 20_640_000,
    liabilitiesCents: 2_380_000,
    netWorthCents: 18_260_000,
  },
  {
    date: "2026-03-01",
    assetsCents: 21_080_000,
    liabilitiesCents: 2_310_000,
    netWorthCents: 18_770_000,
  },
  {
    date: "2026-04-01",
    assetsCents: 20_860_000,
    liabilitiesCents: 2_290_000,
    netWorthCents: 18_570_000,
  },
  {
    date: "2026-05-01",
    assetsCents: 21_540_000,
    liabilitiesCents: 2_250_000,
    netWorthCents: 19_290_000,
  },
  {
    date: "2026-06-01",
    assetsCents: 22_120_000,
    liabilitiesCents: 2_320_000,
    netWorthCents: 19_800_000,
  },
  {
    date: "2026-07-01",
    assetsCents: 22_480_000,
    liabilitiesCents: 2_280_000,
    netWorthCents: 20_200_000,
  },
  {
    date: "2026-08-01",
    assetsCents: 22_310_000,
    liabilitiesCents: 2_260_000,
    netWorthCents: 20_050_000,
  },
  {
    date: "2026-09-01",
    assetsCents: 22_870_000,
    liabilitiesCents: 2_210_000,
    netWorthCents: 20_660_000,
  },
  {
    date: "2026-10-01",
    assetsCents: 23_240_000,
    liabilitiesCents: 2_190_000,
    netWorthCents: 21_050_000,
  },
  {
    date: "2026-11-01",
    assetsCents: 23_760_000,
    liabilitiesCents: 2_170_000,
    netWorthCents: 21_590_000,
  },
  {
    date: "2026-11-11",
    assetsCents: 24_020_000,
    liabilitiesCents: 2_160_000,
    netWorthCents: 21_860_000,
  },
];

const MONTHLY: MonthlySummary[] = [
  { month: "2026-06", incomeCents: 1_240_000, expenseCents: 860_000, netCents: 380_000 },
  { month: "2026-07", incomeCents: 1_180_000, expenseCents: 920_000, netCents: 260_000 },
  { month: "2026-08", incomeCents: 1_420_000, expenseCents: 1_010_000, netCents: 410_000 },
  { month: "2026-09", incomeCents: 1_310_000, expenseCents: 780_000, netCents: 530_000 },
  { month: "2026-10", incomeCents: 1_560_000, expenseCents: 1_120_000, netCents: 440_000 },
  { month: "2026-11", incomeCents: 982_000, expenseCents: 640_000, netCents: 342_000 },
];

const CATEGORY_BREAKDOWN: CategoryBreakdownItem[] = [
  {
    categoryId: "cat-house",
    name: "Moradia",
    slug: "moradia",
    icon: "House",
    color: "#4693ff",
    amountCents: 302_000,
    percentage: 38,
    transactionCount: 4,
  },
  {
    categoryId: "cat-food",
    name: "Alimentação",
    slug: "alimentacao",
    icon: "UtensilsCrossed",
    color: "#f59e0b",
    amountCents: 175_000,
    percentage: 22,
    transactionCount: 18,
  },
  {
    categoryId: "cat-transport",
    name: "Transporte",
    slug: "transporte",
    icon: "Car",
    color: "#a78bfa",
    amountCents: 111_000,
    percentage: 14,
    transactionCount: 9,
  },
  {
    categoryId: "cat-shopping",
    name: "Compras",
    slug: "compras",
    icon: "ShoppingCart",
    color: "#f472b6",
    amountCents: 87_000,
    percentage: 11,
    transactionCount: 7,
  },
  {
    categoryId: "cat-subs",
    name: "Assinaturas",
    slug: "assinaturas",
    icon: "ReceiptText",
    color: "#34d399",
    amountCents: 48_000,
    percentage: 6,
    transactionCount: 5,
  },
  {
    categoryId: "cat-health",
    name: "Saúde",
    slug: "saude",
    icon: "HeartPulse",
    color: "#f87171",
    amountCents: 39_000,
    percentage: 5,
    transactionCount: 3,
  },
];

const CATEGORIES: Category[] = [
  {
    id: "cat-shopping",
    userId: null,
    name: "Compras",
    slug: "compras",
    icon: "ShoppingCart",
    color: "#f472b6",
    kind: "expense",
    parentId: null,
  },
  {
    id: "cat-income",
    userId: null,
    name: "Receitas",
    slug: "receitas",
    icon: "TrendingUp",
    color: "#34d399",
    kind: "income",
    parentId: null,
  },
];

const RECENT_TRANSACTIONS: Transaction[] = [
  {
    id: "tx-1",
    userId: "user-demo",
    accountId: "acc-nu",
    connectionId: "conn-demo",
    externalId: "ext-1",
    date: "2026-11-11",
    description: "Mercado Livre",
    amountCents: -18_990,
    currency: "BRL",
    type: "expense",
    categoryId: "cat-shopping",
    status: "posted",
    billId: null,
    merchant: "Mercado Livre",
    notes: null,
    installmentNumber: null,
    totalInstallments: null,
    budgetGroupId: null,
    createdAt: "2026-11-11T12:00:00.000Z",
    updatedAt: "2026-11-11T12:00:00.000Z",
    category: CATEGORIES[0]!,
    account: {
      id: "acc-nu",
      name: "Cartão Ultravioleta",
      numberMasked: "••1204",
      currency: "BRL",
      balanceCents: -291_407,
      availableCents: null,
      provider: "demo",
      institutionName: "Nubank",
      institutionLogoUrl: null,
    },
  },
  {
    id: "tx-2",
    userId: "user-demo",
    accountId: "acc-itau",
    connectionId: "conn-demo",
    externalId: "ext-2",
    date: "2026-11-10",
    description: "Salário — Acme Ltda.",
    amountCents: 985_000,
    currency: "BRL",
    type: "income",
    categoryId: "cat-income",
    status: "posted",
    billId: null,
    merchant: null,
    notes: null,
    installmentNumber: null,
    totalInstallments: null,
    budgetGroupId: null,
    createdAt: "2026-11-10T12:00:00.000Z",
    updatedAt: "2026-11-10T12:00:00.000Z",
    category: CATEGORIES[1]!,
    account: {
      id: "acc-itau",
      name: "Conta corrente",
      numberMasked: "••4821",
      currency: "BRL",
      balanceCents: 1_248_012,
      availableCents: 1_248_012,
      provider: "demo",
      institutionName: "Itaú",
      institutionLogoUrl: null,
    },
  },
  {
    id: "tx-3",
    userId: "user-demo",
    accountId: "acc-itau",
    connectionId: "conn-demo",
    externalId: "ext-3",
    date: "2026-11-09",
    description: "Aluguel",
    amountCents: -240_000,
    currency: "BRL",
    type: "expense",
    categoryId: null,
    status: "posted",
    billId: null,
    merchant: null,
    notes: null,
    installmentNumber: null,
    totalInstallments: null,
    budgetGroupId: null,
    createdAt: "2026-11-09T12:00:00.000Z",
    updatedAt: "2026-11-09T12:00:00.000Z",
    account: {
      id: "acc-itau",
      name: "Conta corrente",
      numberMasked: "••4821",
      currency: "BRL",
      balanceCents: 1_248_012,
      availableCents: 1_248_012,
      provider: "demo",
      institutionName: "Itaú",
      institutionLogoUrl: null,
    },
  },
];

const CONNECTIONS = [
  { name: "Banco Aurora", tone: "success" as const, status: "Ativa", balance: 482_350 },
  { name: "Nuvem Bank", tone: "success" as const, status: "Ativa", balance: 128_990 },
  {
    name: "Cooperativa Horizonte",
    tone: "warning" as const,
    status: "Sincronizando",
    balance: 76_400,
  },
  { name: "Cartão Aurora", tone: "danger" as const, status: "Erro", balance: -128_450 },
  { name: "Investimentos Nuvem", tone: "neutral" as const, status: "Desconectada", balance: 0 },
];

const TABLE_ROWS = [
  {
    id: "1",
    date: "2026-11-08",
    description: "Mercado Bom Preço",
    institution: "Banco Aurora",
    category: "Mercado",
    amount: -18_490,
  },
  {
    id: "2",
    date: "2026-11-07",
    description: "Salário — Acme Ltda.",
    institution: "Nuvem Bank",
    category: "Salário",
    amount: 1_250_000,
  },
  {
    id: "3",
    date: "2026-11-06",
    description: "Cafeteria do Centro",
    institution: "Cooperativa Horizonte",
    category: "Restaurantes",
    amount: -2_750,
  },
  {
    id: "4",
    date: "2026-11-05",
    description: "Pix recebido — Ana",
    institution: "Nuvem Bank",
    category: "Pix recebido",
    amount: 15_000,
  },
];

function ShowcasePage() {
  if (!import.meta.env.DEV) {
    return (
      <DevUiFrame>
        <div className="mx-auto max-w-xl py-16">
          <EmptyState
            icon={Palette}
            title="Showcase indisponível"
            description="Esta página existe apenas no ambiente de desenvolvimento."
            action={
              <Button asChild variant="outline">
                <Link to="/">Voltar para o início</Link>
              </Button>
            }
          />
        </div>
      </DevUiFrame>
    );
  }

  return (
    <DevUiFrame>
      <Showcase />
    </DevUiFrame>
  );
}

function DevUiFrame({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background">
        <div className="mx-auto flex h-14 w-full max-w-[1320px] items-center gap-3 px-4 sm:px-8">
          <Link to="/" aria-label="Lumen Finance — início" className="rounded-lg">
            <BrandLogo />
          </Link>
          <Badge variant="secondary" className="hidden sm:inline-flex">
            Showcase dev
          </Badge>
          <span className="ml-auto flex items-center gap-1">
            <Button asChild variant="ghost" size="sm">
              <Link to="/">Voltar ao painel</Link>
            </Button>
            <ThemeToggle />
          </span>
        </div>
      </header>
      <div className="mx-auto w-full max-w-[1320px] px-4 py-6 pb-16 sm:px-8 sm:py-7">
        {children}
      </div>
    </div>
  );
}

function Showcase() {
  const [quickPeriod, setQuickPeriod] = useState("30d");
  const [notifications, setNotifications] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [tab, setTab] = useState("patrimonio");

  return (
    <TooltipProvider>
      <div className="space-y-10">
        <PageHeader
          eyebrow="Documentação viva"
          title="Lumen UI"
          badge={
            <>
              <DemoBadge />
              <Badge variant="secondary">estilo Cloudflare</Badge>
            </>
          }
          description="Catálogo dos tokens, primitivos e componentes de domínio do redesign. Escala fechada, cards planos e um único acento azul. Os valores abaixo são fictícios."
          actions={
            <>
              <ToggleGroup
                type="single"
                value={quickPeriod}
                onValueChange={(value) => {
                  if (value) {
                    setQuickPeriod(value);
                  }
                }}
                aria-label="Período de demonstração"
              >
                <ToggleGroupItem value="7d" aria-label="Últimos 7 dias">
                  7D
                </ToggleGroupItem>
                <ToggleGroupItem value="30d" aria-label="Últimos 30 dias">
                  30D
                </ToggleGroupItem>
                <ToggleGroupItem value="90d" aria-label="Últimos 90 dias">
                  90D
                </ToggleGroupItem>
                <ToggleGroupItem value="12m" aria-label="Últimos 12 meses">
                  12M
                </ToggleGroupItem>
              </ToggleGroup>
              <Button
                onClick={() =>
                  toast.success("Tudo pronto", {
                    description: "Este toast usa os tokens do tema atual.",
                  })
                }
              >
                <Sparkles aria-hidden="true" />
                Testar toast
              </Button>
            </>
          }
        />

        <Section
          id="escala"
          title="Escala"
          description="Medidas fechadas do painel: texto, alturas de controle e raios. Nada fora desta tabela."
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Tipografia</CardTitle>
                <CardDescription>Inter Variable, pesos 400/500/600.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {TYPE_SCALE.map((item) => (
                  <div key={item.token} className="flex items-baseline justify-between gap-4">
                    <span className={cn("truncate text-foreground", item.className)}>
                      Lumen Finance
                    </span>
                    <span className="shrink-0 text-right text-xs text-muted-foreground">
                      {item.token} · {item.use}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Alturas e raios</CardTitle>
                <CardDescription>
                  6px em abas, 8px em cards/controles, 12px em overlays.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {CONTROL_HEIGHTS.map((item) => (
                  <div key={item.token} className="flex items-center justify-between gap-4">
                    <div
                      className={cn(
                        "w-24 rounded-md border border-border bg-surface-2",
                        item.className,
                      )}
                    />
                    <span className="shrink-0 text-right text-xs text-muted-foreground">
                      {item.token} · {item.use}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </Section>

        <Section
          id="cores"
          title="Tokens de cor"
          description="Cinzas sem matiz e um acento azul. Verde, vermelho e âmbar só carregam significado."
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
            {COLOR_TOKENS.map((swatch) => (
              <div
                key={swatch.token}
                className="overflow-hidden rounded-lg border border-border bg-card"
              >
                <div
                  className={cn("h-12 border-b border-border-subtle", swatch.className)}
                  aria-hidden="true"
                />
                <div className="px-2.5 py-2">
                  <p className="truncate text-xs font-medium text-foreground">{swatch.name}</p>
                  <p className="truncate font-mono text-[10px] text-muted-foreground">
                    {swatch.token}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section
          id="tipografia"
          title="Tipografia e números"
          description="Rótulos são 12–13px peso 500 em muted-foreground; nada de caixa alta com tracking largo."
        >
          <Card>
            <CardContent className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
              <div className="space-y-4">
                <p className="text-xs font-medium text-muted-foreground">Hierarquia</p>
                <p className="text-2xl font-semibold tracking-[-0.02em]">Receita do mês</p>
                <p className="text-base font-medium text-foreground">Resumo do período</p>
                <p className="max-w-md text-sm leading-5 text-muted-foreground">
                  Texto de apoio usa 14px/20px com contraste AA sobre o fundo. Rótulos de KPI são
                  12px, peso 500, sem caixa alta.
                </p>
                <p className="text-[13px] text-muted-foreground">
                  Texto auxiliar · atualizado {formatDate("2026-11-10")}
                </p>
              </div>
              <div className="space-y-3 rounded-lg border border-border-subtle bg-surface-2/50 p-4">
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-xs text-muted-foreground">Saldo consolidado</span>
                  <MoneyText valueCents={8_234_560} size="lg" tone="neutral" />
                </div>
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-xs text-muted-foreground">Receitas</span>
                  <MoneyText valueCents={1_250_000} size="lg" signDisplay="always" />
                </div>
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-xs text-muted-foreground">Despesas</span>
                  <MoneyText valueCents={-864_320} size="lg" />
                </div>
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-xs text-muted-foreground">Sem dados</span>
                  <MoneyText valueCents={null} size="lg" />
                </div>
                <Separator />
                <div className="flex flex-wrap items-center gap-3">
                  <DeltaBadge value={12.4} label="vs. mês anterior" />
                  <DeltaBadge value={-8.2} label="em despesas" invert />
                  <DeltaBadge value={0} />
                </div>
              </div>
            </CardContent>
          </Card>
        </Section>

        <Section
          id="botoes"
          title="Botões"
          description="36px no padrão, 32px no pequeno, 32px no ícone. Outline e secondary usam fundo card com borda 1px."
        >
          <Card>
            <CardContent className="space-y-5">
              <div className="flex flex-wrap items-center gap-2">
                <Button>Primário</Button>
                <Button variant="secondary">Secundário</Button>
                <Button variant="outline">Contorno</Button>
                <Button variant="ghost">Fantasma</Button>
                <Button variant="destructive">Destrutivo</Button>
                <Button variant="link">Link</Button>
                <Button disabled>Desabilitado</Button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm">Pequeno</Button>
                <Button size="default">Padrão</Button>
                <Button size="lg">Grande</Button>
                <Button size="icon" aria-label="Adicionar">
                  <Plus aria-hidden="true" />
                </Button>
                <Button variant="outline" size="sm">
                  <ArrowRight aria-hidden="true" />
                  Com ícone
                </Button>
                <Button asChild variant="outline" size="sm">
                  <a href="#cores">Link estilizado</a>
                </Button>
              </div>
            </CardContent>
          </Card>
        </Section>

        <Section
          id="formularios"
          title="Formulários"
          description="Inputs de 36px sobre card, foco com borda primária e anel; labels sempre visíveis."
        >
          <Card>
            <CardContent className="grid gap-5 md:grid-cols-2">
              <FormField id="showcase-email" label="E-mail" hint="Usado para entrar na sua conta.">
                <Input id="showcase-email" type="email" placeholder="voce@exemplo.com" />
              </FormField>
              <FormField
                id="showcase-invalid"
                label="Campo inválido"
                error="Informe um e-mail válido."
              >
                <Input id="showcase-invalid" defaultValue="valor inválido" />
              </FormField>
              <div className="space-y-1.5">
                <Label htmlFor="showcase-institution">Instituição</Label>
                <Select defaultValue="aurora">
                  <SelectTrigger id="showcase-institution" className="w-full">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="aurora">Banco Aurora</SelectItem>
                    <SelectItem value="nuvem">Nuvem Bank</SelectItem>
                    <SelectItem value="horizonte">Cooperativa Horizonte</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="showcase-date">Data de referência</Label>
                <Input id="showcase-date" type="date" defaultValue="2026-11-10" />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="showcase-note">Anotação</Label>
                <Textarea id="showcase-note" placeholder="Adicionar uma nota…" />
              </div>
              <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-surface-2/50 px-3 py-2.5">
                <div className="space-y-0.5">
                  <Label htmlFor="showcase-switch">Notificações</Label>
                  <p className="text-xs text-muted-foreground">
                    Avisos de faturas e sincronizações.
                  </p>
                </div>
                <Switch
                  id="showcase-switch"
                  checked={notifications}
                  onCheckedChange={setNotifications}
                />
              </div>
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => toast("Formulário enviado", { description: "Ação fictícia." })}
                >
                  Salvar alterações
                </Button>
                <Button variant="ghost">Cancelar</Button>
              </div>
            </CardContent>
          </Card>
        </Section>

        <Section
          id="selos"
          title="Pills, status e avatares"
          description="Pill de 20px com fundo card; a cor semântica aparece no texto e na borda (40%)."
        >
          <Card>
            <CardContent className="space-y-5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge>Padrão</Badge>
                <Badge variant="secondary">Secundário</Badge>
                <Badge variant="outline">Contorno</Badge>
                <Badge variant="positive">Positivo</Badge>
                <Badge variant="negative">Negativo</Badge>
                <Badge variant="warning">Alerta</Badge>
                <Badge variant="info">Info</Badge>
                <Badge variant="destructive">Destrutivo</Badge>
                <DemoBadge />
              </div>
              <div className="flex flex-wrap items-center gap-5 rounded-lg border border-border-subtle bg-surface-2/40 px-4 py-3">
                <StatusDot tone="success" label="Ativa" />
                <StatusDot tone="warning" label="Sincronizando" pulse />
                <StatusDot tone="warning" label="Requer login" />
                <StatusDot tone="danger" label="Erro" />
                <StatusDot tone="info" label="Em análise" />
                <StatusDot tone="neutral" label="Desconectada" />
              </div>
              <div className="flex flex-wrap items-end gap-4">
                {(["Aurora", "Nuvem Bank", "Cooperativa Horizonte", "Cartão"] as const).map(
                  (name, index) => (
                    <div key={name} className="flex flex-col items-center gap-1.5">
                      <InstitutionAvatar
                        name={name}
                        size={(["sm", "md", "lg"] as const)[index % 3]!}
                        color={index === 3 ? "#facc15" : undefined}
                      />
                      <span className="text-xs text-muted-foreground">{name}</span>
                    </div>
                  ),
                )}
                <Avatar>
                  <AvatarFallback>CN</AvatarFallback>
                </Avatar>
              </div>
            </CardContent>
          </Card>
        </Section>

        <Section
          id="kpis"
          title="KPIs"
          description="Rótulo 12px, valor 24px/600, delta 13px com seta e sparkline em área colada à base."
        >
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Saldo em contas"
              valueCents={1_569_552}
              delta={1.9}
              series={[24, 24.4, 24.1, 25, 25.6, 25.2, 26.1, 26.8]}
            />
            <KpiCard
              label="Receitas"
              valueCents={1_020_000}
              delta={3.4}
              series={[2, 3, 2.6, 3.4, 3.1, 4, 4.4, 4.8]}
              sparklineTone="positive"
            />
            <KpiCard
              label="Despesas"
              valueCents={-678_710}
              delta={8.1}
              invertDelta
              series={[3, 3.4, 3.1, 4, 3.6, 4.4, 4.1, 4.8]}
              sparklineTone="negative"
            />
            <KpiCard
              label="Patrimônio"
              valueCents={null}
              hint="Aguardando sincronização"
              isLoading
            />
          </div>
        </Section>

        <Section
          id="graficos"
          title="Gráficos"
          description="Linha de 1,5px, área a 12%, grade horizontal sutil, eixo Y à direita e tooltip popover."
        >
          <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
            <div className="space-y-4">
              <ChartCard
                title="Patrimônio"
                description="Últimos 12 meses"
                actions={<DeltaBadge value={4.2} />}
                footer={
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-1.5 rounded-[2px] bg-chart-1" aria-hidden="true" />
                    Patrimônio líquido
                  </span>
                }
              >
                <NetWorthAreaChart data={NET_WORTH} height={240} />
              </ChartCard>
              <ChartCard
                title="Receitas vs. despesas"
                description="Fechamento mensal"
                footer={
                  <span className="flex flex-wrap items-center gap-4">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="size-1.5 rounded-[2px] bg-positive" aria-hidden="true" />
                      Receitas
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="size-1.5 rounded-[2px] bg-negative" aria-hidden="true" />
                      Despesas
                    </span>
                  </span>
                }
              >
                <IncomeExpenseBarChart data={MONTHLY} height={220} />
              </ChartCard>
            </div>
            <div className="space-y-4">
              <ChartCard title="Gastos por categoria" description="Top categorias do período">
                <CategoryDonut
                  data={CATEGORY_BREAKDOWN}
                  totalCents={CATEGORY_BREAKDOWN.reduce(
                    (total, item) => total + item.amountCents,
                    0,
                  )}
                  height={200}
                />
              </ChartCard>
              <ChartCard title="Sem dados" description="Estado padrão de gráfico vazio">
                <ChartEmpty height={180} />
              </ChartCard>
              <ChartCard title="Carregando" isLoading>
                <div />
              </ChartCard>
            </div>
          </div>
        </Section>

        <Section
          id="tabela"
          title="Tabela"
          description="Cabeçalho de 40px em background, linha de 44px com divisória sutil e hover accent."
        >
          <Card>
            <CardHeader>
              <CardTitle>Transações recentes</CardTitle>
              <CardDescription>Dados fictícios do provider demo.</CardDescription>
              <CardAction>
                <Badge variant="outline">Novembro</Badge>
              </CardAction>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Instituição</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {TABLE_ROWS.map((transaction) => (
                    <TableRow key={transaction.id}>
                      <TableCell className="text-muted-foreground tabular-nums">
                        {formatDate(transaction.date)}
                      </TableCell>
                      <TableCell className="font-medium">{transaction.description}</TableCell>
                      <TableCell>
                        <span className="flex items-center gap-2">
                          <InstitutionAvatar name={transaction.institution} size="xs" />
                          <span className="text-[13px] text-muted-foreground">
                            {transaction.institution}
                          </span>
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{transaction.category}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <MoneyText valueCents={transaction.amount} size="sm" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
            <CardFooter className="justify-between border-t">
              <span className="text-xs text-muted-foreground">4 de 128 lançamentos</span>
              <Button variant="outline" size="sm">
                Carregar mais
              </Button>
            </CardFooter>
          </Card>
        </Section>

        <Section
          id="lista"
          title="Lista de transações"
          description="Lista compacta usada na visão geral e no detalhe da conta."
        >
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            <Card>
              <CardHeader>
                <CardTitle>Transações recentes</CardTitle>
                <CardDescription>Conta corrente · Itaú</CardDescription>
              </CardHeader>
              <CardContent>
                <TransactionList
                  transactions={RECENT_TRANSACTIONS}
                  categories={CATEGORIES}
                  showAccount
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Resumo do filtro</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                <div className="flex min-h-10 items-center justify-between gap-3 border-b border-dashed border-border-subtle">
                  <span className="flex items-center gap-2 text-[13px] text-muted-foreground">
                    <span className="size-[7px] rounded-full bg-positive" aria-hidden="true" />
                    Entradas
                  </span>
                  <MoneyText valueCents={985_000} size="sm" tone="neutral" />
                </div>
                <div className="flex min-h-10 items-center justify-between gap-3 border-b border-dashed border-border-subtle">
                  <span className="flex items-center gap-2 text-[13px] text-muted-foreground">
                    <span className="size-[7px] rounded-full bg-negative" aria-hidden="true" />
                    Saídas
                  </span>
                  <MoneyText valueCents={-258_990} size="sm" tone="neutral" />
                </div>
                <div className="flex min-h-10 items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-[13px] text-muted-foreground">
                    <span
                      className="size-[7px] rounded-full bg-subtle-foreground"
                      aria-hidden="true"
                    />
                    Resultado
                  </span>
                  <MoneyText valueCents={726_010} size="sm" tone="neutral" />
                </div>
              </CardContent>
            </Card>
          </div>
        </Section>

        <Section
          id="estados"
          title="Estados"
          description="Vazio com ação, erro com retry e carregamento com skeleton."
        >
          <div className="grid gap-4 lg:grid-cols-3">
            <EmptyState
              icon={Inbox}
              title="Nenhuma conta conectada"
              description="Conecte uma instituição para importar saldos, transações e faturas."
              action={
                <Button size="sm">
                  <Plus aria-hidden="true" />
                  Conectar conta
                </Button>
              }
            />
            <ErrorState
              title="Falha ao sincronizar"
              description="O provider não respondeu no tempo esperado."
              error={new Error("Pluggy indisponível (HTTP 503)")}
              isRetrying={retrying}
              onRetry={() => {
                setRetrying(true);
                toast("Tentando novamente…", { description: "Demonstração de retry." });
                window.setTimeout(() => setRetrying(false), 1200);
              }}
            />
            <Card>
              <CardHeader>
                <CardTitle>Skeleton</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-7 w-40" />
                <Skeleton className="h-2.5 w-full" />
                <Skeleton className="h-2.5 w-5/6" />
                <div className="flex gap-2 pt-2">
                  <Skeleton className="h-8 w-24 rounded-lg" />
                  <Skeleton className="h-8 w-24 rounded-lg" />
                </div>
              </CardContent>
            </Card>
          </div>
        </Section>

        <Section
          id="overlays"
          title="Overlays e navegação"
          description="Dialog e toast com raio 12; menus com raio 8. Foco preso, Esc e retorno de foco são do Radix."
        >
          <Card>
            <CardContent className="space-y-5">
              <div className="flex flex-wrap items-center gap-2">
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="outline">Abrir dialog</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Desconectar instituição?</DialogTitle>
                      <DialogDescription>
                        As transações já importadas continuam visíveis. Uma nova sincronização
                        exigirá reconectar a conta.
                      </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                      <Button variant="ghost">Cancelar</Button>
                      <Button variant="destructive">Desconectar</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                <Sheet>
                  <SheetTrigger asChild>
                    <Button variant="outline">Abrir sheet</Button>
                  </SheetTrigger>
                  <SheetContent side="right">
                    <SheetHeader>
                      <SheetTitle>Detalhes da conexão</SheetTitle>
                      <SheetDescription>
                        Última sincronização em {formatDate("2026-11-10")} às 09:12.
                      </SheetDescription>
                    </SheetHeader>
                    <div className="space-y-3 px-4">
                      <div className="flex items-center justify-between rounded-lg border border-border-subtle bg-surface-2/50 p-3">
                        <span className="flex items-center gap-2 text-sm">
                          <InstitutionAvatar name="Banco Aurora" size="sm" />
                          Banco Aurora
                        </span>
                        <StatusDot tone="success" label="Ativa" />
                      </div>
                      <div className="flex items-center justify-between rounded-lg border border-border-subtle bg-surface-2/50 p-3">
                        <span className="flex items-center gap-2 text-sm">
                          <InstitutionAvatar name="Nuvem Bank" size="sm" />
                          Nuvem Bank
                        </span>
                        <StatusDot tone="warning" label="Sincronizando" pulse />
                      </div>
                    </div>
                    <div className="mt-auto border-t border-border-subtle px-4 py-3">
                      <Button className="w-full" size="sm">
                        Reconectar
                      </Button>
                    </div>
                  </SheetContent>
                </Sheet>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline">
                      Menu
                      <ChevronDown aria-hidden="true" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuLabel>Conta</DropdownMenuLabel>
                    <DropdownMenuItem>
                      <Landmark aria-hidden="true" />
                      Ver contas
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <CalendarRange aria-hidden="true" />
                      Exportar período
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive">Sair</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline">Popover</Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="space-y-2">
                    <p className="text-sm font-medium">Faturas abertas</p>
                    <p className="text-xs text-muted-foreground">
                      Duas faturas vencem nos próximos 7 dias.
                    </p>
                    <Button size="sm" className="w-full">
                      Ver faturas
                    </Button>
                  </PopoverContent>
                </Popover>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label="Mais opções">
                      <MoreHorizontal aria-hidden="true" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Mais opções</TooltipContent>
                </Tooltip>

                <ToggleGroup
                  type="single"
                  value={tab}
                  onValueChange={(value) => {
                    if (value) {
                      setTab(value);
                    }
                  }}
                  aria-label="Visualização de exemplo"
                >
                  <ToggleGroupItem value="patrimonio">Patrimônio</ToggleGroupItem>
                  <ToggleGroupItem value="fluxo">Fluxo</ToggleGroupItem>
                </ToggleGroup>
              </div>

              <Tabs value={tab} onValueChange={setTab}>
                <TabsList>
                  <TabsTrigger value="patrimonio">Patrimônio</TabsTrigger>
                  <TabsTrigger value="fluxo">Receitas vs. despesas</TabsTrigger>
                  <TabsTrigger value="config">Configurações</TabsTrigger>
                </TabsList>
                <TabsContent value="patrimonio" className="rounded-lg border border-border p-4">
                  <NetWorthAreaChart data={NET_WORTH} height={180} />
                </TabsContent>
                <TabsContent value="fluxo" className="rounded-lg border border-border p-4">
                  <IncomeExpenseBarChart data={MONTHLY} height={180} />
                </TabsContent>
                <TabsContent value="config" className="rounded-lg border border-border p-4">
                  <p className="text-sm text-muted-foreground">
                    Preferências da conta, do tema e da privacidade de valores.
                  </p>
                </TabsContent>
              </Tabs>

              <Separator />

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="mb-2 text-xs font-medium text-muted-foreground">Scroll area</p>
                  <ScrollArea className="h-40 rounded-lg border border-border">
                    <div className="space-y-1 p-2">
                      {CONNECTIONS.map((connection) => (
                        <div
                          key={connection.name}
                          className="flex min-h-9 items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-accent/60"
                        >
                          <InstitutionAvatar name={connection.name} size="sm" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13px] font-medium">{connection.name}</p>
                            <StatusDot tone={connection.tone} label={connection.status} />
                          </div>
                          <MoneyText valueCents={connection.balance} size="sm" tone="neutral" />
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
                <div>
                  <p className="mb-2 text-xs font-medium text-muted-foreground">
                    Skeleton de lista
                  </p>
                  <div className="space-y-2 rounded-lg border border-border p-3">
                    {[0, 1, 2].map((row) => (
                      <div key={row} className="flex items-center gap-3">
                        <Skeleton className="size-8 rounded-md" />
                        <div className="flex-1 space-y-1.5">
                          <Skeleton className="h-3 w-1/2" />
                          <Skeleton className="h-2.5 w-1/3" />
                        </div>
                        <Skeleton className="h-3 w-16" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Check aria-hidden="true" className="size-3.5 text-positive" />
                Todos os componentes usam os tokens do tema e suportam teclado.
              </div>
            </CardContent>
          </Card>
        </Section>

        <Section
          id="regras"
          title="Regras de uso"
          description="Resumo do que o redesign muda na prática."
        >
          <Card>
            <CardContent>
              <ul className="grid gap-2 text-[13px] leading-5 text-muted-foreground sm:grid-cols-2">
                <li>Cards têm borda 1px e nenhuma sombra; sombra só em popover, dialog e toast.</li>
                <li>Verde, vermelho e âmbar carregam significado; botão primário é sempre azul.</li>
                <li>Rótulos são 12–13px peso 500; não use caixa alta com tracking largo.</li>
                <li>
                  Foco visível global de 2px com offset; cards não podem cortar o anel dos filhos.
                </li>
                <li>Valores monetários usam tabular-nums e centavos; nunca float.</li>
                <li>Dados do provider demo aparecem sempre com o selo "Demonstração".</li>
              </ul>
            </CardContent>
          </Card>
        </Section>
      </div>
    </TooltipProvider>
  );
}

function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-20 space-y-3">
      <div className="space-y-0.5">
        <h2 id={`${id}-title`} className="text-base font-medium tracking-tight">
          {title}
        </h2>
        {description ? <p className="text-[13px] text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}
