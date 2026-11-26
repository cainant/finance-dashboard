// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PLUGGY_CONNECTOR_ICON_BASE } from "@/lib/institution-logo";

import { InstitutionAvatar } from "./institution-avatar";

afterEach(cleanup);

function avatarElement(container: HTMLElement): HTMLElement {
  const element = container.querySelector<HTMLElement>('[data-slot="institution-avatar"]');
  if (!element) throw new Error("avatar não renderizado");
  return element;
}

describe("InstitutionAvatar", () => {
  it("mostra as iniciais enquanto o logo carrega, sem fundo branco", () => {
    const { container } = render(<InstitutionAvatar name="Nubank" />);
    const image = container.querySelector("img");
    const avatar = avatarElement(container);

    expect(avatar.getAttribute("data-logo")).toBe("true");
    expect(avatar.getAttribute("data-logo-state")).toBe("loading");
    expect(image?.getAttribute("src")).toBe(`${PLUGGY_CONNECTOR_ICON_BASE}/212.svg`);
    expect(image?.className).toContain("opacity-0");
    expect(image?.className).not.toContain("bg-white");
    // As iniciais continuam visíveis (placeholder atrás da imagem invisível).
    expect(screen.getByText("NU")).toBeTruthy();
  });

  it("mostra o logo com fundo branco depois do onLoad", () => {
    const { container } = render(<InstitutionAvatar name="Nubank" size="sm" />);
    const image = container.querySelector("img");

    fireEvent.load(image!);

    const avatar = avatarElement(container);
    expect(avatar.getAttribute("data-logo-state")).toBe("loaded");
    expect(image?.className).toContain("bg-white");
    expect(image?.className).toContain("opacity-100");
    expect(avatar.className).toContain("size-8");
  });

  it("cai para as iniciais quando a imagem falha, sem mudar o tamanho do bloco", () => {
    const { container } = render(<InstitutionAvatar name="Itaú" size="sm" />);
    const before = avatarElement(container);
    const image = container.querySelector("img");

    expect(before.className).toContain("size-8");
    fireEvent.error(image!);

    const after = avatarElement(container);
    expect(after.getAttribute("data-logo")).toBe("false");
    expect(after.getAttribute("data-logo-state")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("IT")).toBeTruthy();
    expect(after.className).toContain("size-8");
  });

  it("renderiza só iniciais para instituições sem logo verificado", () => {
    const { container } = render(<InstitutionAvatar name="MeuPluggy" />);

    expect(container.querySelector("img")).toBeNull();
    expect(avatarElement(container).getAttribute("data-logo")).toBe("false");
    expect(screen.getByText("ME")).toBeTruthy();
  });

  it("mantém a cor de marca e o rótulo acessível", () => {
    const { container } = render(<InstitutionAvatar name="Banco Aurora" color="#facc15" />);
    const avatar = avatarElement(container);

    expect(avatar.getAttribute("aria-label")).toBe("Instituição Banco Aurora");
    expect(avatar.style.background).toBe("rgb(250, 204, 21)");
    expect(screen.getByText("BA")).toBeTruthy();
  });

  it("modo decorativo não duplica o anúncio do nome", () => {
    const { container } = render(<InstitutionAvatar name="Nubank" decorative />);
    const avatar = avatarElement(container);

    expect(avatar.getAttribute("aria-hidden")).toBe("true");
    expect(avatar.getAttribute("role")).toBeNull();
    expect(avatar.getAttribute("aria-label")).toBeNull();
    expect(avatar.getAttribute("title")).toBeNull();
  });
});
