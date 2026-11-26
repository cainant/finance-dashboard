import type { Transaction } from "@fd/contracts";
import { useEffect, useRef, useState, type RefObject } from "react";
import { toast } from "sonner";

import { TRANSACTION_UPDATE_TOAST_ID, useUpdateTransactionMutation } from "@/lib/mutations";

export interface UseTransactionEditingOptions {
  transaction: Transaction;
  /** Registra a categoria de origem antes de gravar a troca (ver `CategoryPicker`). */
  onCategoryOriginChange: (transaction: Transaction) => void;
  /** O conteúdo registra aqui como salvar a nota pendente ao fechar (Esc/overlay/arrasto). */
  flushNotesRef: RefObject<() => void>;
  /** Texto do toast "Desfazer" após trocar a categoria (`null` = remover). */
  categoryToastMessage: (categoryId: string | null) => string;
  /**
   * Quando presente (e o conteúdo ainda montado), o aviso com "Desfazer" vai
   * para ele em vez do toast do sonner. O bottom sheet usa isto: o Radix marca
   * o toast (irmão do portal) com `aria-hidden` enquanto o sheet está aberto.
   */
  onNotice?: (notice: EditNotice) => void;
}

export interface EditNotice {
  message: string;
  /**
   * Desfaz a alteração e resolve só depois de a API confirmar; rejeita se a
   * gravação falhar (quem chama decide como avisar).
   */
  undo: () => Promise<void>;
}

/**
 * Edição compartilhada do detalhe da transação (painel desktop e bottom sheet
 * mobile): a nota salva ao sair do campo e a categoria na hora, ambas com toast
 * "Desfazer".
 */
export function useTransactionEditing({
  transaction,
  onCategoryOriginChange,
  flushNotesRef,
  categoryToastMessage,
  onNotice,
}: UseTransactionEditingOptions) {
  const updateMutation = useUpdateTransactionMutation();
  const committedNotes = useRef<string | null>(transaction.notes ?? null);
  // Categoria já gravada na API. A prop `transaction` só atualiza depois do
  // refetch: duas trocas seguidas dentro dessa janela desfariam para um valor
  // velho se o "anterior" saísse dela.
  const committedCategory = useRef<string | null>(transaction.categoryId);
  // Trocas de categoria em andamento. O refetch da troca anterior pode chegar
  // com a seguinte ainda no ar; sincronizar aí devolveria o ref a um valor velho
  // (e uma troca para esse valor seria ignorada como "igual").
  const categoryMutationsInFlight = useRef(0);
  useEffect(() => {
    if (categoryMutationsInFlight.current > 0) {
      return;
    }
    committedCategory.current = transaction.categoryId;
  }, [transaction.categoryId]);
  const [noteDraft, setNoteDraft] = useState(transaction.notes ?? "");
  // Só a troca de categoria bloqueia o seletor; salvar a nota (blur) não deve
  // desabilitar o próximo clique do usuário.
  const [isSavingCategory, setIsSavingCategory] = useState(false);

  // Um aviso que chega depois do fechamento (nota salva ao desmontar) cai no toast.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  function notify(message: string, undo: () => Promise<void>) {
    // O toast do hook ("Notas salvas") dá lugar ao aviso com "Desfazer".
    toast.dismiss(TRANSACTION_UPDATE_TOAST_ID);

    if (onNotice && mounted.current) {
      onNotice({ message, undo });
      return;
    }

    toast.success(message, {
      action: {
        label: "Desfazer",
        // O erro já vira toast no `useUpdateTransactionMutation`.
        onClick: () => void undo().catch(() => {}),
      },
    });
  }

  function commitNotes(value: string | null) {
    if (value === committedNotes.current) {
      return;
    }

    const previous = committedNotes.current;
    committedNotes.current = value;
    setNoteDraft(value ?? "");

    void updateMutation
      .mutateAsync({ id: transaction.id, notes: value })
      .then(() => {
        notify(value ? "Anotação salva" : "Anotação removida", () =>
          updateMutation.mutateAsync({ id: transaction.id, notes: previous }).then(() => {}),
        );
      })
      .catch(() => {
        // O erro já vira toast no `useUpdateTransactionMutation`.
        committedNotes.current = previous;
      });
  }

  /** Salva o rascunho atual (trim; vazio vira `null`). */
  function commitDraft() {
    commitNotes(noteDraft.trim() || null);
  }

  // Mantém o flush do fechamento com o rascunho mais recente.
  useEffect(() => {
    flushNotesRef.current = () => commitNotes(noteDraft.trim() || null);
  });

  // Fechar pelo "voltar" do navegador desmonta o conteúdo sem passar por
  // `onOpenChange`, então a nota digitada precisa ser salva na desmontagem.
  useEffect(() => {
    return () => {
      flushNotesRef.current();
    };
  }, [flushNotesRef]);

  async function changeCategory(categoryId: string | null) {
    if (categoryId === committedCategory.current) {
      return;
    }

    // Antes de gravar: a categoria de outra natureza (ex.: "Transferências" em
    // um Pix de saída) deixa de ser a atual, mas continua fixada no seletor.
    onCategoryOriginChange(transaction);

    const previous = committedCategory.current;

    setIsSavingCategory(true);
    categoryMutationsInFlight.current += 1;
    try {
      await updateMutation.mutateAsync({ id: transaction.id, categoryId });
      committedCategory.current = categoryId;
      notify(categoryToastMessage(categoryId), async () => {
        categoryMutationsInFlight.current += 1;
        try {
          await updateMutation.mutateAsync({ id: transaction.id, categoryId: previous });
          committedCategory.current = previous;
        } finally {
          categoryMutationsInFlight.current -= 1;
        }
      });
    } catch {
      // O erro já vira toast no `useUpdateTransactionMutation`.
    } finally {
      categoryMutationsInFlight.current -= 1;
      setIsSavingCategory(false);
    }
  }

  return {
    noteDraft,
    setNoteDraft,
    commitDraft,
    isSavingCategory,
    changeCategory,
  };
}
