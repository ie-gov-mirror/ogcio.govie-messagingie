"use client"

import { InputText } from "@ogcio/design-system-react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { CssSpinner } from "@/components/css-spinner"
import { debounce } from "@/util/profile-admin/debounce"
import styles from "./search-form.module.css"

const SEARCH_DEBOUNCE_MS = 500

type InputTextChangeEvent = React.ChangeEvent<HTMLInputElement> & {
  __origin?: string
}

export const SearchForm = memo(function SearchForm({
  searchKey,
  pageKey,
}: {
  searchKey: string
  pageKey: string
}) {
  const t = useTranslations("serviceUsers")
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const urlValue = searchParams.get(searchKey) ?? ""
  const [inputValue, setInputValue] = useState(urlValue)
  const searchParamsRef = useRef(searchParams)
  const latestInputRef = useRef(urlValue)
  searchParamsRef.current = searchParams

  useEffect(() => {
    setInputValue((current) => (current === urlValue ? current : urlValue))
    latestInputRef.current = urlValue
  }, [urlValue])

  const pushQuery = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParamsRef.current)
      params.delete(pageKey)

      if (value.trim()) {
        params.set(searchKey, value.trim())
      } else {
        params.delete(searchKey)
      }

      const qs = params.toString()
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [router, pathname, searchKey, pageKey],
  )

  const pushQueryRef = useRef(pushQuery)
  pushQueryRef.current = pushQuery

  const debouncedPush = useMemo(
    () =>
      debounce(
        (value: string) => pushQueryRef.current(value),
        SEARCH_DEBOUNCE_MS,
      ),
    [],
  )

  useEffect(() => () => debouncedPush.cancel(), [debouncedPush])

  const submitSearch = (value: string) => {
    debouncedPush.cancel()
    pushQuery(value)
  }

  const isSearchPending = inputValue.trim() !== urlValue.trim()
  const showClearButton = !isSearchPending && inputValue.length > 0

  return (
    <InputText
      className={styles.searchInput}
      id={searchKey}
      type='text'
      placeholder={t(`${searchKey}.search.placeholder`)}
      value={inputValue}
      aria-label={t(`${searchKey}.search.button`)}
      aria-busy={isSearchPending}
      clearButtonEnabled={showClearButton}
      iconEnd={
        isSearchPending ? (
          <span
            data-testid='search-pending-spinner'
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "1rem",
              height: "1rem",
              transform: "translate(-4px, 2px)",
            }}
          >
            <CssSpinner size='sm' />
          </span>
        ) : undefined
      }
      onChange={(event: InputTextChangeEvent) => {
        const value = event.target.value
        latestInputRef.current = value
        setInputValue(value)
        if (event.__origin === "clear_button") {
          submitSearch("")
        } else {
          debouncedPush(value)
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
