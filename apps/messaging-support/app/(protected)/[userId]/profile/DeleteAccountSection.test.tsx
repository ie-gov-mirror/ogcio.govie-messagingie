import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { useRouter } from "next/navigation"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { MainProfile } from "@/data/types"
import { deleteAccountAction } from "@/utils/actions"
import { DeleteAccountSection } from "./DeleteAccountSection"

vi.mock("@/utils/actions", () => ({
  deleteAccountAction: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(),
  useSearchParams: () => new URLSearchParams("email=a%40b.ie"),
}))

const profile: MainProfile = {
  id: "p-1",
  primaryUserId: "p-1",
  publicName: "Ada L",
  status: "active",
}

const checkboxLabels = [
  /I understand deletion is permanent/,
  /I confirm I have authority/,
  /I have verified this is the account/,
]

function openConfirmation() {
  render(<DeleteAccountSection profile={profile} />)
  fireEvent.click(screen.getByRole("button", { name: "Delete Account" }))
}

function checkAll() {
  for (const label of checkboxLabels) {
    fireEvent.click(screen.getByLabelText(label))
  }
}

describe("DeleteAccountSection", () => {
  const mockPush = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useRouter).mockReturnValue({
      push: mockPush,
    } as unknown as ReturnType<typeof useRouter>)
  })

  it("shows only the trigger button before confirmation", () => {
    render(<DeleteAccountSection profile={profile} />)

    expect(
      screen.getByRole("button", { name: "Delete Account" }),
    ).toBeInTheDocument()
    expect(screen.queryByText(/permanently delete/)).not.toBeInTheDocument()
  })

  it("keeps the delete button disabled until every box is checked", () => {
    openConfirmation()

    const deleteButton = screen.getByRole("button", { name: "Delete Account" })
    expect(deleteButton).toBeDisabled()

    checkAll()

    expect(deleteButton).toBeEnabled()
  })

  it("cancel hides the confirmation and resets the checks", () => {
    openConfirmation()
    checkAll()

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    // back to the single trigger button
    fireEvent.click(screen.getByRole("button", { name: "Delete Account" }))

    expect(
      screen.getByRole("button", { name: "Delete Account" }),
    ).toBeDisabled()
  })

  it("calls the delete action and redirects home with the search params", async () => {
    vi.useFakeTimers()
    try {
      vi.mocked(deleteAccountAction).mockResolvedValue({
        success: true,
        value: undefined,
      })
      openConfirmation()
      checkAll()

      fireEvent.click(screen.getByRole("button", { name: "Delete Account" }))

      await vi.waitFor(() => {
        expect(deleteAccountAction).toHaveBeenCalledWith({ profileId: "p-1" })
      })
      await vi.advanceTimersByTimeAsync(2500)
      expect(mockPush).toHaveBeenCalledWith("/?email=a%40b.ie")
    } finally {
      vi.useRealTimers()
    }
  })

  it("stays on the page when the delete action fails", async () => {
    vi.mocked(deleteAccountAction).mockResolvedValue({
      success: false,
      error: new Error("nope"),
      userMessage: "nope",
    })
    openConfirmation()
    checkAll()

    fireEvent.click(screen.getByRole("button", { name: "Delete Account" }))

    await waitFor(() => {
      expect(deleteAccountAction).toHaveBeenCalled()
    })
    expect(mockPush).not.toHaveBeenCalled()
  })
})
