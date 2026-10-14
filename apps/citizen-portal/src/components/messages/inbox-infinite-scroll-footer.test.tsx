import { act, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock("@/components/css-spinner", () => ({
  CssSpinner: ({ dataTestid }: { dataTestid?: string }) => (
    <span data-testid={dataTestid}>Loading</span>
  ),
}))

let intersectionCallback: IntersectionObserverCallback
const observe = vi.fn()
const disconnect = vi.fn()

class IntersectionObserverMock {
  constructor(callback: IntersectionObserverCallback) {
    intersectionCallback = callback
  }

  observe = observe
  disconnect = disconnect
}

import { InboxInfiniteScrollFooter } from "./inbox-infinite-scroll-footer"

describe("InboxInfiniteScrollFooter", () => {
  beforeEach(() => {
    observe.mockClear()
    disconnect.mockClear()
    vi.stubGlobal("IntersectionObserver", IntersectionObserverMock)
  })

  it("loads the next page only when an eligible sentinel intersects", () => {
    const onLoadMore = vi.fn()
    render(<InboxInfiniteScrollFooter hasMore onLoadMore={onLoadMore} />)

    expect(observe).toHaveBeenCalledOnce()
    act(() => {
      intersectionCallback(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      )
    })
    expect(onLoadMore).toHaveBeenCalledOnce()
  })

  it("shows a live loading state and does not request another page", () => {
    const onLoadMore = vi.fn()
    render(
      <InboxInfiniteScrollFooter
        hasMore
        isLoadingMore
        onLoadMore={onLoadMore}
      />,
    )

    expect(
      screen.getByRole("status", { name: "loadingMore" }),
    ).toBeInTheDocument()
    expect(screen.getByTestId("inbox-load-more-spinner")).toBeInTheDocument()
    act(() => {
      intersectionCallback(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      )
    })
    expect(onLoadMore).not.toHaveBeenCalled()
  })
})
