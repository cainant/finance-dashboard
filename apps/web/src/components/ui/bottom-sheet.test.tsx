// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  BottomSheet,
  BottomSheetBody,
  BottomSheetContent,
  BottomSheetHeader,
  BottomSheetTrigger,
} from "./bottom-sheet";
import { registerOpenBottomSheet, useBottomSheetOpen } from "./bottom-sheet-state";

afterEach(cleanup);

function Harness({
  onChange,
  withBack = false,
  startOpen = true,
}: {
  onChange?: (open: boolean) => void;
  withBack?: boolean;
  startOpen?: boolean;
}) {
  const [open, setOpen] = useState(startOpen);
  const [page, setPage] = useState<"root" | "child">(withBack ? "child" : "root");

  return (
    <BottomSheet
      open={open}
      onOpenChange={(next) => {
        onChange?.(next);
        setOpen(next);
      }}
    >
      <BottomSheetTrigger>Abrir</BottomSheetTrigger>
      <BottomSheetContent>
        <BottomSheetHeader
          title={page === "child" ? "Categoria" : "Detalhe"}
          onBack={page === "child" ? () => setPage("root") : undefined}
        />
        <BottomSheetBody data-testid="body">
          <p>Conteúdo</p>
        </BottomSheetBody>
      </BottomSheetContent>
    </BottomSheet>
  );
}

function drag(target: Element, from: number, to: number) {
  fireEvent.pointerDown(target, { pointerId: 1, clientY: from, button: 0 });
  fireEvent.pointerMove(target, { pointerId: 1, clientY: (from + to) / 2 });
  fireEvent.pointerMove(target, { pointerId: 1, clientY: to });
  fireEvent.pointerUp(target, { pointerId: 1, clientY: to });
}

function handleOf(dialog: HTMLElement): Element {
  return dialog.querySelector('[data-slot="bottom-sheet-handle"]')!;
}

describe("BottomSheet", () => {
  it("é um diálogo modal com o título como nome acessível", () => {
    render(<Harness />);

    const dialog = screen.getByRole("dialog", { name: "Detalhe" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("data-slot")).toBe("bottom-sheet-content");
  });

  it("fecha com Esc e pelo botão Fechar", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onChange).toHaveBeenLastCalledWith(false);

    cleanup();
    onChange.mockClear();
    render(<Harness onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    expect(onChange).toHaveBeenLastCalledWith(false);
  });

  it("prende o foco dentro do sheet ao abrir (primeiro controle: Fechar)", () => {
    render(<Harness />);

    const dialog = screen.getByRole("dialog");
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Fechar" }));
  });

  it("devolve o foco ao gatilho ao fechar", async () => {
    render(<Harness startOpen={false} />);
    const trigger = screen.getByRole("button", { name: "Abrir" });
    trigger.focus();
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    await vi.waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("página filha: o cabeçalho mostra o botão voltar e o título da página", () => {
    render(<Harness withBack />);

    expect(screen.getByRole("dialog", { name: "Categoria" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Voltar" }));
    expect(screen.getByRole("dialog", { name: "Detalhe" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Voltar" })).toBeNull();
  });

  it("botões só de ícone têm rótulo e alvo de toque de 44px (size-11)", () => {
    render(<Harness withBack />);

    for (const name of ["Voltar", "Fechar"]) {
      const button = screen.getByRole("button", { name });
      expect(button.className).toContain("size-11");
    }
  });

  describe("arrasto", () => {
    it("acompanha o dedo por variável CSS e fecha passando da distância", () => {
      const onChange = vi.fn();
      render(<Harness onChange={onChange} />);
      const dialog = screen.getByRole("dialog");
      const handle = handleOf(dialog);

      fireEvent.pointerDown(handle, { pointerId: 1, clientY: 100, button: 0 });
      fireEvent.pointerMove(handle, { pointerId: 1, clientY: 190 });
      expect(dialog.style.getPropertyValue("--bs-drag")).toBe("90px");
      expect(dialog.getAttribute("data-dragging")).toBe("true");

      fireEvent.pointerMove(handle, { pointerId: 1, clientY: 260 });
      fireEvent.pointerUp(handle, { pointerId: 1, clientY: 260 });
      expect(onChange).toHaveBeenCalledWith(false);
      expect(dialog.hasAttribute("data-dragging")).toBe(false);
    });

    it("não passa de 0 ao arrastar para cima", () => {
      render(<Harness />);
      const dialog = screen.getByRole("dialog");
      const handle = handleOf(dialog);

      fireEvent.pointerDown(handle, { pointerId: 1, clientY: 200, button: 0 });
      fireEvent.pointerMove(handle, { pointerId: 1, clientY: 120 });

      expect(dialog.style.getPropertyValue("--bs-drag")).toBe("0px");
    });

    it("solta com pouca distância: volta à posição aberta, sem fechar", () => {
      const onChange = vi.fn();
      render(<Harness onChange={onChange} />);
      const dialog = screen.getByRole("dialog");

      // 10px: passa da folga do toque, mas é curto demais até para um arremesso.
      drag(handleOf(dialog), 100, 110);

      expect(onChange).not.toHaveBeenCalled();
      expect(dialog.style.getPropertyValue("--bs-drag")).toBe("");
    });

    it("pointercancel não fecha mesmo com a distância longa", () => {
      const onChange = vi.fn();
      render(<Harness onChange={onChange} />);
      const dialog = screen.getByRole("dialog");
      const handle = handleOf(dialog);

      fireEvent.pointerDown(handle, { pointerId: 1, clientY: 100, button: 0 });
      fireEvent.pointerMove(handle, { pointerId: 1, clientY: 300 });
      fireEvent.pointerCancel(handle, { pointerId: 1, clientY: 300 });

      expect(onChange).not.toHaveBeenCalled();
      expect(dialog.style.getPropertyValue("--bs-drag")).toBe("");
    });

    it("não inicia o arrasto pelo corpo (a rolagem interna fica livre)", () => {
      const onChange = vi.fn();
      render(<Harness onChange={onChange} />);
      const dialog = screen.getByRole("dialog");

      drag(screen.getByTestId("body"), 100, 400);

      expect(onChange).not.toHaveBeenCalled();
      expect(dialog.style.getPropertyValue("--bs-drag")).toBe("");
    });

    it("não inicia o arrasto sobre um botão do cabeçalho", () => {
      const onChange = vi.fn();
      render(<Harness onChange={onChange} />);
      const dialog = screen.getByRole("dialog");

      drag(screen.getByRole("button", { name: "Fechar" }), 100, 400);

      expect(onChange).not.toHaveBeenCalled();
      expect(dialog.style.getPropertyValue("--bs-drag")).toBe("");
    });
  });

  it("avisa o Toaster enquanto o sheet está montado", () => {
    const states: boolean[] = [];

    function Probe() {
      states.push(useBottomSheetOpen());
      return null;
    }

    render(<Probe />);
    expect(states.at(-1)).toBe(false);

    const release = registerOpenBottomSheet();
    cleanup();
    render(<Probe />);
    expect(states.at(-1)).toBe(true);
    release();
  });

  it("monta e desmonta o registro junto com o conteúdo", () => {
    const states: boolean[] = [];

    function Probe() {
      states.push(useBottomSheetOpen());
      return null;
    }

    render(
      <>
        <Probe />
        <Harness />
      </>,
    );
    expect(states.at(-1)).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    cleanup();
    render(<Probe />);
    expect(states.at(-1)).toBe(false);
  });
});
