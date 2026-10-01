"use client"

import {
  Button,
  DataTableHeader,
  DataTableHeaderFilter,
  DataTableHeaderFilterActions,
  DataTableHeaderFilterContent,
  DataTableHeaderFilterContentTitle,
  DataTableHeaderFilterList,
  DataTableHeaderSearch,
  InputRadio,
  InputRadioGroup,
  Popover,
} from "@ogcio/design-system-react"
import { usePathname, useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import {
  memo,
  type RefObject,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react"
import { useUrlSearchParams } from "@/hooks/use-url-search-params"
import { InboxListSearchField } from "./inbox-list-search-field"
import {
  activeMessageFilterLabels,
  emptyMessageFilters,
  type MessageFilterState,
  type MessageFilterStatus,
  messageFiltersFromStatusParam,
  statusParamFromMessageFilters,
} from "./messages-data-table-filters"
import styles from "./messages-data-table-header.module.css"

export interface MessagesDataTableHeaderProps {
  showHeader?: boolean
  enableFilters?: boolean
  searchInputTestId?: string
}

/**
 * URL-driven inbox search/filter chrome. Mounted as a sibling of the message
 * list (not inside the table) so it stays mounted while the list refetches.
 */
export const MessagesDataTableHeader = memo(function MessagesDataTableHeader({
  showHeader = true,
  enableFilters = true,
  searchInputTestId = "search-input",
}: MessagesDataTableHeaderProps) {
  const tFilter = useTranslations("home.table.filter")
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useUrlSearchParams()

  const statusValue = searchParams.get("status")
  const appliedFilters = useMemo(
    () => messageFiltersFromStatusParam(statusValue),
    [statusValue],
  )

  const [filterOpen, setFilterOpen] = useState(false)
  const [temporaryFilters, setTemporaryFilters] =
    useState<MessageFilterState>(appliedFilters)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const searchParamsRef = useRef(searchParams)
  searchParamsRef.current = searchParams

  const pushQuery = useCallback(
    (params: URLSearchParams) => {
      const qs = params.toString()
      router.push(qs ? `${pathname}?${qs}` : pathname)
    },
    [router, pathname],
  )

  const onApplyFilters = useCallback(
    (filters: MessageFilterState) => {
      const params = new URLSearchParams(searchParamsRef.current)
      params.delete("page")

      const status = statusParamFromMessageFilters(filters)
      if (status) {
        params.set("status", status)
      } else {
        params.delete("status")
      }

      pushQuery(params)
    },
    [pushQuery],
  )

  const filterOptions: {
    id: MessageFilterStatus
    label: string
    value: MessageFilterStatus
  }[] = useMemo(
    () => [
      { id: "unread", label: tFilter("unread"), value: "unread" },
      { id: "read", label: tFilter("read"), value: "read" },
    ],
    [tFilter],
  )

  const handleTemporaryStatusChange = (
    event?: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const value = event?.target.value
    if (value === "unread" || value === "read") {
      setTemporaryFilters({ selectedStatuses: [value] })
    }
  }

  const handleApplyFilter = () => {
    onApplyFilters(temporaryFilters)
    setFilterOpen(false)
  }

  const handleClearFilters = () => {
    setTemporaryFilters(emptyMessageFilters)
    onApplyFilters(emptyMessageFilters)
    setFilterOpen(false)
  }

  const handleRemoveFilter = (id: string) => {
    const nextFilters: MessageFilterState = {
      selectedStatuses: appliedFilters.selectedStatuses.filter(
        (current) => current !== id,
      ),
    }
    setTemporaryFilters(nextFilters)
    onApplyFilters(nextFilters)
  }

  const handleFilterOpen = () => {
    setTemporaryFilters({ ...appliedFilters })
    setFilterOpen(true)
  }

  const handlePopoverOpenChange = (open: boolean) => {
    if (open) {
      setTemporaryFilters({ ...appliedFilters })
    }
    setFilterOpen(open)
  }

  const activeFiltersList = activeMessageFilterLabels({
    filters: appliedFilters,
    labels: {
      unread: tFilter("unread"),
      read: tFilter("read"),
    },
  })

  return (
    <DataTableHeader
      showHeader={showHeader}
      showFilter={enableFilters}
      className={enableFilters ? undefined : styles.searchOnlyChrome}
    >
      <DataTableHeaderSearch
        className={enableFilters ? styles.searchBesideFilters : undefined}
      >
        <InboxListSearchField
          searchInputTestId={searchInputTestId}
          inputId='messages-data-table-search'
        />
      </DataTableHeaderSearch>

      {enableFilters ? (
        <DataTableHeaderFilter>
          <Button
            ref={triggerRef}
            onClick={handleFilterOpen}
            variant='secondary'
            appearance='dark'
            data-testid='status-filter'
          >
            {tFilter("button")}
          </Button>
          <Popover
            triggerRef={triggerRef as RefObject<HTMLButtonElement>}
            open={filterOpen}
            onOpenChange={handlePopoverOpenChange}
            className='!gi-bg-white'
          >
            <div className='gi-flex gi-flex-col gi-max-h-100 gi-max-w-100'>
              <DataTableHeaderFilterContent>
                <DataTableHeaderFilterContentTitle>
                  {tFilter("status")}
                </DataTableHeaderFilterContentTitle>
                <InputRadioGroup
                  groupId='message-status-filter'
                  value={temporaryFilters.selectedStatuses[0] ?? ""}
                  onChange={handleTemporaryStatusChange}
                >
                  {filterOptions.map((option) => (
                    <InputRadio
                      key={option.id}
                      id={`filter-${option.id}`}
                      label={option.label}
                      value={option.value}
                      size='sm'
                    />
                  ))}
                </InputRadioGroup>
              </DataTableHeaderFilterContent>

              <DataTableHeaderFilterActions>
                <Button
                  onClick={handleClearFilters}
                  variant='flat'
                  appearance='dark'
                >
                  {tFilter("clear")}
                </Button>
                <Button
                  onClick={handleApplyFilter}
                  variant='secondary'
                  appearance='dark'
                >
                  {tFilter("apply")}
                </Button>
              </DataTableHeaderFilterActions>
            </div>
          </Popover>
        </DataTableHeaderFilter>
      ) : null}

      {enableFilters ? (
        <DataTableHeaderFilterList
          filters={activeFiltersList}
          onRemove={handleRemoveFilter}
          onClear={handleClearFilters}
        />
      ) : null}
    </DataTableHeader>
  )
})
