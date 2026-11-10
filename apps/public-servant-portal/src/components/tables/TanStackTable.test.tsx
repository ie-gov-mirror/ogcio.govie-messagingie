import { createColumnHelper, useTable } from "@tanstack/react-table"
import { render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"
import { TanStackTable } from "./TanStackTable"
import { type Features, features } from "./table-features"

vi.mock("@ogcio/design-system-react", () => ({
  Spinner: () => <span data-testid='spinner' />,
  Table: ({
    children,
    "aria-label": ariaLabel,
  }: {
    children: ReactNode
    "aria-label"?: string
    noBorder?: boolean
    layout?: string
  }) => <table aria-label={ariaLabel}>{children}</table>,
  TableBody: ({ children }: { children: ReactNode }) => (
    <tbody>{children}</tbody>
  ),
  TableData: ({
    children,
    ...props
  }: {
    children: ReactNode
    colSpan?: number
  }) => <td {...props}>{children}</td>,
  TableHead: ({ children }: { children: ReactNode }) => (
    <thead>{children}</thead>
  ),
  TableHeader: ({ children }: { children: ReactNode }) => <th>{children}</th>,
  TableRow: ({ children }: { children: ReactNode }) => <tr>{children}</tr>,
}))

type Row = { name: string }

const columnHelper = createColumnHelper<Features, Row>()
const columns = [
  columnHelper.accessor("name", {
    header: "Name",
    cell: (info) => info.getValue(),
  }),
]

function TableHarness({
  data = [],
  ...props
}: {
  data?: Row[]
  isLoading?: boolean
  emptyMessage?: string
  errorMessage?: string
}) {
  const table = useTable({ features, data, columns })

  return <TanStackTable table={table} aria-label='People' {...props} />
}

describe(TanStackTable.name, () => {
  it("renders headers and rows", () => {
    render(<TableHarness data={[{ name: "Ada" }]} />)

    expect(screen.getByRole("table", { name: "People" })).toBeInTheDocument()
    expect(
      screen.getByRole("columnheader", { name: "Name" }),
    ).toBeInTheDocument()
    expect(screen.getByRole("cell", { name: "Ada" })).toBeInTheDocument()
  })

  it("renders loading, error, and empty states", () => {
    const { rerender } = render(<TableHarness isLoading />)
    expect(screen.getByTestId("spinner")).toBeInTheDocument()

    rerender(<TableHarness errorMessage='Unavailable' />)
    expect(screen.getByText("Unavailable")).toBeInTheDocument()

    rerender(<TableHarness emptyMessage='No rows' />)
    expect(screen.getByText("No rows")).toBeInTheDocument()
  })
})
