import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { Skeleton } from "./skeleton"

describe("Skeleton", () => {
  it("renders a decorative placeholder with configurable dimensions", () => {
    render(
      <Skeleton
        width='8rem'
        height='2rem'
        className='extra'
        dataTestid='skeleton'
      />,
    )

    expect(screen.getByTestId("skeleton")).toHaveAttribute(
      "aria-hidden",
      "true",
    )
    expect(screen.getByTestId("skeleton")).toHaveClass("extra")
    expect(screen.getByTestId("skeleton").style.width).toBe("8rem")
    expect(screen.getByTestId("skeleton").style.height).toBe("2rem")
  })
})
