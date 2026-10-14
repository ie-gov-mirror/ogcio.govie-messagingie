import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { CssSpinner } from "./css-spinner"
import { HtmlLangScript } from "./html-lang-script"
import { LoadMaterialSymbols } from "./load-material-symbols"
import { PageLoading } from "./page-loading"
import { PanelLoading } from "./panel-loading"

const writeLocaleCookie = vi.hoisted(() => vi.fn())

vi.mock("@/util/locale-cookie", () => ({ writeLocaleCookie }))

describe("component primitives", () => {
  beforeEach(() => {
    writeLocaleCookie.mockClear()
  })

  it("renders decorative spinners inside labelled loading regions", () => {
    const { rerender } = render(<PageLoading />)

    expect(
      screen.getByRole("status", { name: "Loading" }).style.minHeight,
    ).toBe("30vh")
    expect(screen.getByRole("status").firstElementChild).toHaveAttribute(
      "aria-hidden",
      "true",
    )

    rerender(<PanelLoading ariaLabel='Loading panel' minHeight='10rem' />)
    expect(
      screen.getByRole("status", { name: "Loading panel" }).style.minHeight,
    ).toBe("10rem")

    rerender(<CssSpinner dataTestid='spinner' size='sm' />)
    expect(screen.getByTestId("spinner")).toHaveAttribute("aria-hidden", "true")
  })

  it("updates the document language and persists it", () => {
    const { rerender } = render(<HtmlLangScript locale='en' />)
    expect(document.documentElement.lang).toBe("en")
    expect(writeLocaleCookie).toHaveBeenLastCalledWith("en")

    rerender(<HtmlLangScript locale='ga' />)
    expect(document.documentElement.lang).toBe("ga")
    expect(writeLocaleCookie).toHaveBeenLastCalledWith("ga")
  })

  it("preloads the material symbols stylesheet", () => {
    const { container } = render(<LoadMaterialSymbols />)
    const stylesheet = container.querySelector("link[rel='stylesheet']")

    expect(stylesheet).toHaveAttribute(
      "href",
      expect.stringContaining("icon_names=accessibility_new"),
    )
  })
})
