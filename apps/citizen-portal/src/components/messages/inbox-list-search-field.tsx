"use client"

import { InputText } from "@ogcio/design-system-react"
import { usePathname, useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { CssSpinner } from "@/components/css-spinner"
import { useUrlSearchParams } from "@/hooks/use-url-search-params"
import { debounce } from "./debounce"
import styles from "./inbox-list-search-field.module.css"

const SEARCH_DEBOUNCE_MS = 500

type InputTextChangeEvent = React.ChangeEvent<HTMLInputElement> & {
  __origin?: string
}

export interface InboxListSearchFieldProps {
  searchInputTestId?: string
  inputId?: string
  /** Defaults to the generic "Search" copy. */
  placeholder?: string
  ariaLabel?: string
  /** Shows a trailing magnifier while the field is idle and empty. */
  showSearchIcon?: boolean
}

/**
 * URL-driven list search field with debounced submit, DS clear control, and a
 * pending spinner in the clear-button slot. Shared by the messages inbox and
 * applications list.
 */
export const InboxListSearchField = memo(function InboxListSearchField({
  searchInputTestId = "search-input",
  inputId = "inbox-list-search",
  placeholder,
  ariaLabel,
  showSearchIcon = false,
}: InboxListSearchFieldProps) {
  const tSearch = useTranslations("search")
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useUrlSearchParams()

  const searchValue = searchParams.get("search") ?? ""
  const [inputSearch, setInputSearch] = useState(searchValue)
  const searchParamsRef = useRef(searchParams)
  const latestInputRef = useRef(searchValue)
  searchParamsRef.current = searchParams

  useEffect(() => {
    setInputSearch((current) =>
      current === searchValue ? current : searchValue,
    )
    latestInputRef.current = searchValue
  }, [searchValue])

  /**
   * Push the URL for a new search/page state.
   *
   * Next.js App Router quirk: `router.push("?")` (empty query string,
   * relative URL) is treated as a no-op — same path, same `(empty) query`
   * key, so the router never re-fires and `useSearchParams()` keeps its
   * previous value. Falling back to the bare `pathname` whenever there are
   * no remaining params forces a real navigation that strips the entire
   * query string in one go.
   *
   * After a full page reload, `router.replace()` can revert a client-side
   * URL clear back to the stale search param from the initial RSC payload
   * (AB#40679). Update the address bar via `history.replaceState` only;
   * `useUrlSearchParams()` subscribers stay in sync via the history patch.
   */
  const pushQuery = useCallback(
    (params: URLSearchParams) => {
      const qs = params.toString()
      const url = qs ? `${pathname}?${qs}` : pathname

      if (typeof window !== "undefined") {
        window.history.replaceState(window.history.state, "", url)
        return
      }

      router.replace(url, { scroll: false })
    },
    [router, pathname],
  )

  const onSearchChange = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParamsRef.current)
      params.delete("page")

      if (value.trim()) {
        params.set("search", value.trim())
      } else {
        params.delete("search")
      }

      pushQuery(params)
    },
    [pushQuery],
  )

  const onSearchChangeRef = useRef(onSearchChange)
  onSearchChangeRef.current = onSearchChange

  const debouncedSearch = useMemo(
    () =>
      debounce(
        (value: string) => onSearchChangeRef.current(value),
        SEARCH_DEBOUNCE_MS,
      ),
    [],
  )

  useEffect(() => () => debouncedSearch.cancel(), [debouncedSearch])

  const submitSearch = (value: string) => {
    debouncedSearch.cancel()
    onSearchChange(value)
  }

  const isSearchPending = inputSearch.trim() !== searchValue.trim()
  const showClearButton = !isSearchPending && inputSearch.length > 0

  return (
    <InputText
      data-testid={searchInputTestId}
      id={inputId}
      type='text'
      placeholder={placeholder ?? tSearch("input.placeholder")}
      value={inputSearch}
      aria-label={ariaLabel ?? tSearch("button.search")}
      aria-busy={isSearchPending}
      clearButtonEnabled={showClearButton}
      iconEnd={
        isSearchPending ? (
          <span
            data-testid='search-pending-spinner'
            className={styles.searchPendingSpinner}
          >
            <CssSpinner size='sm' />
          </span>
        ) : showSearchIcon && !showClearButton ? (
          "search"
        ) : undefined
      }
      className={styles.searchInput}
      onChange={(event: InputTextChangeEvent) => {
        const value = event.target.value
        latestInputRef.current = value
        setInputSearch(value)
        if (event.__origin === "clear_button") {
          submitSearch("")
        } else {
          debouncedSearch(value)
        }
      }}
      onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === "Enter") {
          submitSearch(latestInputRef.current)
        }
      }}
    />
  )
})
