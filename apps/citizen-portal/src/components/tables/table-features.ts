import {
  type ColumnDef,
  columnVisibilityFeature,
  type RowData,
  tableFeatures,
} from "@tanstack/react-table"

export const features = tableFeatures({ columnVisibilityFeature })
export type Features = typeof features
export type Column<T extends RowData> = ColumnDef<Features, T>
