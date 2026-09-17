import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { toasterCreate, trigger, useGatewayMutation } = vi.hoisted(() => ({
  toasterCreate: vi.fn(),
  trigger: vi.fn(),
  useGatewayMutation: vi.fn(),
}))

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => `profile.${key}`,
}))

vi.mock("@ogcio/sag-client/react", () => ({
  useGatewayMutation,
}))

// DS form primitives + the toaster carry side effects (portal mount,
// CSS-only theming) that don't matter for the contract this test
// pins: form submit → gateway mutation → success/failure
// toast fires. Stub them as passthroughs.
vi.mock("@ogcio/design-system-react", () => ({
  FormField: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  FormFieldError: ({ text }: { text: string }) => (
    <div data-testid='public-name-validation-error'>{text}</div>
  ),
  Heading: ({
    children,
    id,
  }: {
    children: React.ReactNode
    id?: string
  }) => <h2 id={id}>{children}</h2>,
  Paragraph: ({
    children,
    id,
  }: {
    children: React.ReactNode
    id?: string
  }) => (
    <p id={id} data-testid='public-name-helper'>
      {children}
    </p>
  ),
  Stack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TextInput: ({
    value,
    onChange,
    ...rest
  }: {
    value: string
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  } & React.InputHTMLAttributes<HTMLInputElement>) => (
    <input value={value} onChange={onChange} {...rest} />
  ),
  toaster: {
    create: (...args: unknown[]) => toasterCreate(...args),
  },
}))

vi.mock("@/components/layout/containers", () => ({
  FullWidthContainer: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}))

import { PublicNameForm } from "@/components/profile/public-name-form"

/**
 * `PublicNameForm` is the only mutation surface on `/en/my-profile`.
 * The test pins:
 *   1. the profile-relative path and PATCH method passed to sag-client,
 *   2. the empty-input client-side validation gate,
 *   3. the success vs. failure toast variants.
 *
 * A regression on (1) silently breaks the form on every environment;
 * a regression on (2) lets the API see an empty
 * publicName which it accepts and the user loses their handle.
 */
describe("PublicNameForm", () => {
  const onUpdated = vi.fn()

  beforeEach(() => {
    trigger.mockReset()
    useGatewayMutation.mockReset()
    useGatewayMutation.mockReturnValue({ trigger, isLoading: false })
    onUpdated.mockReset()
    toasterCreate.mockReset()
  })

  it("PATCHes the profile through sag-client with the trimmed publicName, then fires the success toast", async () => {
    trigger.mockResolvedValueOnce(undefined)

    render(
      <PublicNameForm
        publicName='  Jane Doe  '
        profileId='profile-1'
        onUpdated={onUpdated}
      />,
    )

    fireEvent.submit(screen.getByTestId("public-name-form"))

    expect(useGatewayMutation).toHaveBeenCalledWith(
      "/profile/api/v1/profiles/profile-1",
      { method: "PATCH" },
    )
    await waitFor(() =>
      expect(trigger).toHaveBeenCalledWith({
        publicName: "Jane Doe",
      }),
    )

    await waitFor(() => expect(onUpdated).toHaveBeenCalledTimes(1))
    expect(toasterCreate).toHaveBeenCalledWith(
      expect.objectContaining({ variant: "success" }),
    )
  })

  it("blocks submission and surfaces a validation error when the input is empty", async () => {
    render(
      <PublicNameForm
        publicName=''
        profileId='profile-1'
        onUpdated={onUpdated}
      />,
    )

    fireEvent.submit(screen.getByTestId("public-name-form"))

    await waitFor(() =>
      expect(
        screen.getByTestId("public-name-validation-error"),
      ).toBeInTheDocument(),
    )
    expect(trigger).not.toHaveBeenCalled()
    expect(onUpdated).not.toHaveBeenCalled()
  })

  it("fires the danger toast when the gateway mutation fails", async () => {
    trigger.mockRejectedValueOnce(new Error("network down"))

    render(
      <PublicNameForm
        publicName='Jane'
        profileId='profile-1'
        onUpdated={onUpdated}
      />,
    )

    fireEvent.submit(screen.getByTestId("public-name-form"))

    await waitFor(() => expect(toasterCreate).toHaveBeenCalledTimes(1))
    expect(toasterCreate).toHaveBeenCalledWith(
      expect.objectContaining({ variant: "danger" }),
    )
  })

  it("renders the helper as a paragraph", () => {
    render(
      <PublicNameForm
        publicName='Jane'
        profileId='profile-1'
        onUpdated={onUpdated}
      />,
    )

    const helper = screen.getByTestId("public-name-helper")
    expect(helper.tagName).toBe("P")
    expect(helper).toHaveTextContent("profile.form.description")
  })
})
