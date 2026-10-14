import type { Profile } from "@ogcio/building-blocks-sdk/dist/types"
import dayjs from "dayjs"
import customParseFormat from "dayjs/plugin/customParseFormat"
import { decodeDateParam } from "@/utils/appliedFilter"
import { serverProfileFilterKeySelectOptions } from "@/utils/appliedFilter.server"
import type { NextSearchParams, Result } from "../types"
import { failure, GENERIC_USER_ERROR, success } from "../utils"

dayjs.extend(customParseFormat)

/**
 * Accepts "YYYY-MM-DD" or "DD/MM/YYYY" and always returns "YYYY-MM-DD".
 * Throws if the value is not a valid date in either format.
 */
function toISODate(value: string): string {
  const parsed = dayjs(value, "YYYY-MM-DD", true).isValid()
    ? dayjs(value, "YYYY-MM-DD", true)
    : dayjs(value, "DD/MM/YYYY", true)

  if (!parsed.isValid()) {
    throw new Error(`Invalid date value: ${value}`)
  }

  return parsed.format("YYYY-MM-DD")
}

type SearchSupportUsersBody = Parameters<
  Profile["support"]["postProfileSearch"]
>[0]

type SearchSupportUsersBodyTextKey = Extract<
  {
    [Key in keyof SearchSupportUsersBody]: SearchSupportUsersBody[Key] extends
      | string[]
      | undefined
      ? Key
      : never
  }[keyof SearchSupportUsersBody],
  string
>

type SearchSupportUsersBodyDateKey = Extract<
  {
    [Key in keyof SearchSupportUsersBody]: SearchSupportUsersBody[Key] extends
      | { from?: string; to?: string }[]
      | undefined
      ? Key
      : never
  }[keyof SearchSupportUsersBody],
  string
>

const searchSupportUsersBodyTextKeys = [
  "name",
  "email",
  "ppsn",
  "id",
] as const satisfies readonly SearchSupportUsersBodyTextKey[]

const searchSupportUsersBodyDateKeys = [
  "dateOfBirth",
] as const satisfies readonly SearchSupportUsersBodyDateKey[]

function isSearchSupportUsersBodyTextKey(
  value: string,
): value is SearchSupportUsersBodyTextKey {
  return (searchSupportUsersBodyTextKeys as readonly string[]).includes(value)
}

function isSearchSupportUsersBodyDateKey(
  value: string,
): value is SearchSupportUsersBodyDateKey {
  return (searchSupportUsersBodyDateKeys as readonly string[]).includes(value)
}

export function buildListUserSdkBody(
  searchParams: NextSearchParams,
): Result<SearchSupportUsersBody> {
  const outputBody: SearchSupportUsersBody = {}

  try {
    for (const key of Object.keys(searchParams)) {
      const option = serverProfileFilterKeySelectOptions.find(
        (o) => o.value === key,
      )
      if (!option) {
        continue
      }

      const values = Array.isArray(searchParams[key])
        ? searchParams[key]
        : [searchParams[key]]

      const filteredValues = values.map((val) => val.trim()).filter(Boolean)
      switch (option.type) {
        case "text":
          if (!isSearchSupportUsersBodyTextKey(option.value)) {
            return failure(
              new Error(`unexpected text filter value: ${option.value}`),
              GENERIC_USER_ERROR,
            )
          }

          if (filteredValues.length === 0) {
            continue
          }
          outputBody[option.value] = filteredValues
          break
        case "date":
          if (!isSearchSupportUsersBodyDateKey(option.value)) {
            return failure(
              new Error(`unexpected date filter value: ${option.value}`),
              GENERIC_USER_ERROR,
            )
          }

          outputBody[option.value] = filteredValues
            .map((val) => decodeDateParam(val))
            .map(({ from, to }) => ({
              from: from ? toISODate(from) : undefined,
              to: to ? toISODate(to) : undefined,
            }))
            .filter(({ from, to }) => Boolean(from || to))
          break
      }
    }

    const logicalOperator = searchParams.logicalOperator
    if (logicalOperator === "and" || logicalOperator === "or") {
      outputBody.logicalOperator = logicalOperator
    }

    const offset = searchParams.offset
    if (typeof offset === "string") {
      outputBody.offset = offset
    }

    const limit = searchParams.limit
    if (typeof limit === "string") {
      outputBody.limit = limit
    }
  } catch (err) {
    return failure(err, GENERIC_USER_ERROR)
  }

  return success(outputBody)
}
