import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useCreateFolder } from "@/components/messages/use-create-folder"
import { useDeleteFolder } from "@/components/messages/use-delete-folder"
import { useRenameFolder } from "@/components/messages/use-rename-folder"
import { fakeAnalytics } from "../../../test/utils/analytics"

const createTrigger = vi.fn()
const clientMutate = vi.fn()

vi.mock("@ogcio/sag-client/react", () => ({
  useGatewayMutation: () => ({ trigger: createTrigger, isLoading: false }),
  useSagClient: () => ({ mutate: clientMutate }),
}))

/** Mimics the gateway's SagFetchError shape (carries an HTTP `status`). */
class FakeFetchError extends Error {
  status: number
  constructor(status: number) {
    super("boom")
    this.status = status
  }
}

beforeEach(() => {
  createTrigger.mockReset()
  clientMutate.mockReset()
})

describe("useCreateFolder", () => {
  it("returns the new folder id on success", async () => {
    createTrigger.mockResolvedValue({ id: "tag-new" })
    const { result } = renderHook(() => useCreateFolder())

    let outcome: Awaited<ReturnType<typeof result.current.createFolder>>
    await act(async () => {
      outcome = await result.current.createFolder("Bills")
    })

    expect(createTrigger).toHaveBeenCalledWith({ label: "Bills" })
    expect(outcome!).toEqual({ ok: true, id: "tag-new" })
  })

  it("flags a 409 as a conflict", async () => {
    createTrigger.mockRejectedValue(new FakeFetchError(409))
    const { result } = renderHook(() => useCreateFolder())

    let outcome: Awaited<ReturnType<typeof result.current.createFolder>>
    await act(async () => {
      outcome = await result.current.createFolder("EHIC")
    })

    expect(outcome!).toEqual({ ok: false, conflict: true })
  })

  it("treats non-409 errors as generic failures", async () => {
    createTrigger.mockRejectedValue(new FakeFetchError(500))
    const { result } = renderHook(() => useCreateFolder())

    let outcome: Awaited<ReturnType<typeof result.current.createFolder>>
    await act(async () => {
      outcome = await result.current.createFolder("EHIC")
    })

    expect(outcome!).toEqual({ ok: false, conflict: false })
  })
})

describe("useRenameFolder", () => {
  it("PATCHes the folder path with the new label", async () => {
    clientMutate.mockResolvedValue({ data: { id: "tag-1" } })
    const { result } = renderHook(() => useRenameFolder())

    let outcome: Awaited<ReturnType<typeof result.current.renameFolder>>
    await act(async () => {
      outcome = await result.current.renameFolder("tag-1", "Renamed")
    })

    expect(clientMutate).toHaveBeenCalledWith(
      "/messaging/api/v1/tags/tag-1",
      "PATCH",
      { label: "Renamed" },
    )
    expect(outcome!).toEqual({ ok: true })
  })

  it("flags a 409 as a conflict", async () => {
    clientMutate.mockRejectedValue(new FakeFetchError(409))
    const { result } = renderHook(() => useRenameFolder())

    let outcome: Awaited<ReturnType<typeof result.current.renameFolder>>
    await act(async () => {
      outcome = await result.current.renameFolder("tag-1", "EHIC")
    })

    expect(outcome!).toEqual({ ok: false, conflict: true })
  })
})

describe("useDeleteFolder", () => {
  it("DELETEs the folder path", async () => {
    clientMutate.mockResolvedValue({ data: { id: "tag-1" } })
    const { result } = renderHook(() => useDeleteFolder())

    let outcome: Awaited<ReturnType<typeof result.current.deleteFolder>>
    await act(async () => {
      outcome = await result.current.deleteFolder("tag-1")
    })

    expect(clientMutate).toHaveBeenCalledWith(
      "/messaging/api/v1/tags/tag-1",
      "DELETE",
    )
    expect(outcome!).toEqual({ ok: true })
  })

  it("returns ok=false when the delete fails", async () => {
    clientMutate.mockRejectedValue(new FakeFetchError(500))
    const { result } = renderHook(() => useDeleteFolder())

    let outcome: Awaited<ReturnType<typeof result.current.deleteFolder>>
    await act(async () => {
      outcome = await result.current.deleteFolder("tag-1")
    })

    expect(outcome!).toEqual({ ok: false })
  })
})

describe("folder analytics", () => {
  const folderEvent = (name: string, action: string) => ({
    event: { name, category: "Folder", action },
  })

  async function run(action: () => Promise<unknown>) {
    await act(async () => {
      await action()
    })
  }

  it("tracks a created folder, not a failed create (a duplicate name included)", async () => {
    const analytics = fakeAnalytics()
    const { result } = renderHook(() => useCreateFolder(), {
      wrapper: analytics.wrapper,
    })

    createTrigger.mockResolvedValueOnce({ id: "tag-new" })
    await run(() => result.current.createFolder("Bills"))
    createTrigger.mockRejectedValueOnce(new FakeFetchError(409))
    await run(() => result.current.createFolder("Bills"))

    expect(analytics.event.mock.calls).toEqual([
      [folderEvent("folder-create", "Folder Created")],
    ])
  })

  it("tracks a renamed folder, not a failed rename", async () => {
    const analytics = fakeAnalytics()
    const { result } = renderHook(() => useRenameFolder(), {
      wrapper: analytics.wrapper,
    })

    clientMutate.mockResolvedValueOnce({ data: { id: "tag-1" } })
    await run(() => result.current.renameFolder("tag-1", "Renamed"))
    clientMutate.mockRejectedValueOnce(new FakeFetchError(500))
    await run(() => result.current.renameFolder("tag-1", "Renamed"))

    expect(analytics.event.mock.calls).toEqual([
      [folderEvent("folder-rename", "Folder Renamed")],
    ])
  })

  it("tracks a deleted folder, not a failed delete", async () => {
    const analytics = fakeAnalytics()
    const { result } = renderHook(() => useDeleteFolder(), {
      wrapper: analytics.wrapper,
    })

    clientMutate.mockResolvedValueOnce({ data: { id: "tag-1" } })
    await run(() => result.current.deleteFolder("tag-1"))
    clientMutate.mockRejectedValueOnce(new FakeFetchError(500))
    await run(() => result.current.deleteFolder("tag-1"))

    expect(analytics.event.mock.calls).toEqual([
      [folderEvent("folder-delete", "Folder Deleted")],
    ])
  })
})
