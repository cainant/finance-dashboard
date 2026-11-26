/**
 * Textos de UI que mudam conforme o modo demonstração exista ou não.
 *
 * Manter as frases em funções puras permite testar os dois modos sem DOM e
 * garante que a produção (demo desabilitado) não exiba nenhuma menção a demo.
 */

export interface EmptyStateCopy {
  title: string;
  description: string;
}

export function overviewConnectCopy(demoEnabled: boolean): EmptyStateCopy {
  return demoEnabled
    ? {
        title: "Comece conectando uma instituição",
        description:
          "Use o provider de demonstração para explorar o painel com 3 instituições fictícias e ~12 meses de transações — ou conecte uma conta real pelo Pluggy.",
      }
    : {
        title: "Conecte seu MeuPluggy",
        description:
          "Autorize seus bancos em meu.pluggy.ai e conecte o MeuPluggy aqui para trazer saldos, transações, cartões e investimentos reais para o painel.",
      };
}

export function overviewPrimaryActionLabel(demoEnabled: boolean): string {
  return demoEnabled ? "Conectar demonstração" : "Conectar MeuPluggy";
}

export function connectionsPageDescription(demoEnabled: boolean): string {
  return demoEnabled
    ? "Gerencie as instituições que alimentam o painel. O provider demo é sempre rotulado; o Pluggy usa Open Finance via MeuPluggy ou widget."
    : "Gerencie as instituições que alimentam o painel. Conecte o MeuPluggy para ler suas contas reais via Open Finance.";
}

export function connectionsIntro(demoEnabled: boolean): string {
  return demoEnabled
    ? "Comece com o provider demo ou autorize uma instituição real pelo Open Finance."
    : "Conecte o MeuPluggy para autorizar seus bancos e importar os dados reais.";
}

export function connectionsEmptyDescription(demoEnabled: boolean): string {
  return demoEnabled
    ? "Comece com o provider demo para explorar o painel ou conecte o Pluggy para ler contas reais."
    : "Conecte o MeuPluggy para importar suas contas, cartões e transações reais.";
}

export function accountsEmptyDescription(demoEnabled: boolean): string {
  return demoEnabled
    ? "Conecte uma instituição para importar saldos e acompanhar a evolução de cada conta. Você pode começar pelo provider de demonstração."
    : "Conecte o MeuPluggy para importar os saldos das suas contas e acompanhar a evolução de cada uma.";
}

export function creditCardsEmptyDescription(demoEnabled: boolean): string {
  return demoEnabled
    ? "Conecte uma instituição com cartão de crédito para acompanhar limite, fechamento e vencimento das faturas. O provider de demonstração já traz dois cartões fictícios."
    : "Conecte o MeuPluggy para acompanhar limite, fechamento e vencimento das faturas dos seus cartões reais.";
}

export function transactionsEmptyDescription(demoEnabled: boolean): string {
  return demoEnabled
    ? "Conecte uma instituição (ou use a demonstração) para importar os lançamentos do período."
    : "Conecte o MeuPluggy para importar os lançamentos do período.";
}
