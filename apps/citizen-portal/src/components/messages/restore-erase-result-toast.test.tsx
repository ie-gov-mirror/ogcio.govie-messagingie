import { render } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { RestoreEraseResultToast } from "@/components/messages/restore-erase-result-toast"

const createSpy = vi.fn()
vi.mock("@ogcio/design-system-react", () => ({
  toaster: { create: (args: unknown) => createSpy(args) },
}))

vi.mock("next-intl", () => ({
  useTranslations:
    (namespace: string) =>
    (key: string, params?: { [k: string]: string | number }) =>
      `${namespace}.${key}:${params?.count}`,
}))

describe("RestoreEraseResultToast", () => {
  beforeEach(() => {
    createSpy.mockReset()
  })

  it("does nothing without a result", () => {
    render(
      <RestoreEraseResultToast
        action='restore'
        result={null}
        onDismiss={vi.fn()}
      />,
    )
    expect(createSpy).not.toHaveBeenCalled()
  })

  it.each([
    ["restore", "home.restore.alert"],
    ["erase", "home.erase.alert"],
  ] as const)("shows the %s success toast and dismisses", (action, ns) => {
    const onDismiss = vi.fn()
    render(
      <RestoreEraseResultToast
        action={action}
        result={{ ok: true, ids: ["a", "b"] }}
        onDismiss={onDismiss}
      />,
    )
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        title: `${ns}.success:2`,
        variant: "success",
        "data-testid": `${action}-success-toast`,
      }),
    )
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it("shows a danger toast on failure", () => {
    render(
      <RestoreEraseResultToast
        action='erase'
        result={{ ok: false, ids: ["a"] }}
        onDismiss={vi.fn()}
      />,
    )
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "home.erase.alert.failure:1",
        variant: "danger",
        duration: 8_000,
        "data-testid": "erase-failure-toast",
      }),
    )
  })
})
