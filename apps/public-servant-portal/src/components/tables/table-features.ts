import {
  type ColumnDef,
  columnVisibilityFeature,
  type ReactTable,
  type RowData,
  tableFeatures,
} from "@tanstack/react-table"

export const features = tableFeatures({ columnVisibilityFeature })
export type Features = typeof features
export type Column<T extends RowData> = ColumnDef<Features, T>
export type TableInstance<T extends RowData> = ReactTable<Features, T>
