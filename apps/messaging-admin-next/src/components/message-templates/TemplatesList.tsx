"use client"

import {
  Button,
  FormField,
  IconButton,
  Link,
  ModalBody,
  ModalFooter,
  ModalTitle,
  ModalWrapper,
  Paragraph,
  Spinner,
  Stack,
  TextInput,
  toaster,
} from "@ogcio/design-system-react"
import { useAnalytics } from "@ogcio/nextjs-analytics"
import { useGatewayFetch, useGatewayMutation } from "@ogcio/sag-client/react"
import {
  type ColumnDef,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import {
  type ChangeEvent,
  type FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { FullWidthContainer, TwoColumnLayout } from "@/components/containers"
import { TanStackTable } from "@/components/tables/TanStackTable"
import { ANALYTICS } from "@/const/analytics"
import { useOrganizationId } from "@/hooks/use-organization-id"
import type { TemplateListItem } from "@/types/types"
import { messagingApi } from "@/util/api-paths"
import { templateRoutes } from "@/util/routes"
import {
  buildClientUrl,
  buildClientUrlWithSearchParams,
} from "@/util/url-utils.client"

const deleteToDefault = Object.freeze({
  id: "",
  name: "",
})

function templateDisplayName(template: TemplateListItem, locale: string) {
  return (
    template.contents.find((content) => content.language === locale)
      ?.templateName ||
    template.contents.at(0)?.templateName ||
    ""
  )
}

export default function TemplatesList() {
  const t = useTranslations("template")
  const tSearch = useTranslations("search")
  const locale = useLocale()
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()
  const analyticsClient = useAnalytics()
  const organizationId = useOrganizationId()

  const search = searchParams.get("search")?.toString() || undefined
  const [searchText, setSearchText] = useState("")
  const [toDelete, setToDelete] = useState<{ id: string; name: string }>(
    deleteToDefault,
  )
  const [deleteError, setDeleteError] = useState(false)

  useEffect(() => {
    setSearchText(searchParams.get("search")?.toString() || "")
  }, [searchParams])

  const templatesPath = useMemo(
    () => messagingApi.templates({ search, limit: "100" }),
    [search],
  )

  const {
    data: templates,
    isLoading: isFetching,
    error,
    refresh,
  } = useGatewayFetch<TemplateListItem[]>(templatesPath)

  const deletePath = toDelete.id
    ? messagingApi.deleteTemplate(toDelete.id)
    : null

  const { trigger: deleteTemplate, isLoading: isDeleting } =
    useGatewayMutation<unknown>(deletePath, {
      method: "DELETE",
      organizationId,
    })

  const columns = useMemo<ColumnDef<TemplateListItem>[]>(
    () => [
      {
        id: "name",
        header: t("table.header.name"),
        meta: { size: "fluid" },
        accessorFn: (row) => templateDisplayName(row, locale),
      },
      {
        id: "languages",
        header: t("table.header.languages"),
        meta: { size: "sm-fixed" },
        accessorFn: (row) =>
          row.contents
            .map((content) => content.language.toUpperCase())
            .sort()
            .join(", "),
      },
      {
        id: "actions",
        header: t("table.header.actions"),
        meta: { size: "md-fixed" },
        enableSorting: false,
        cell: ({ row }) => {
          const template = row.original
          const templateName = templateDisplayName(template, locale)

          return (
            <Stack direction='row' gap={3} itemsAlignment='center'>
              <Link
                href={
                  buildClientUrlWithSearchParams({
                    locale: locale,
                    dir: templateRoutes.url,
                    searchParams: { id: template.id },
                  }).href
                }
                onClick={() =>
                  analyticsClient.trackEvent({
                    event: {
                      name: ANALYTICS.template.edit.name,
                      category: ANALYTICS.template.category,
                      action: ANALYTICS.template.edit.action,
                    },
                  })
                }
              >
                {t("table.link.edit")}
              </Link>
              <Link
                onClick={() =>
                  analyticsClient.trackEvent({
                    event: {
                      name: ANALYTICS.template.preview.name,
                      category: ANALYTICS.template.category,
                      action: ANALYTICS.template.preview.action,
                    },
                  })
                }
                href={`/${locale}/send-a-message?templateId=${template.id}`}
              >
                {t("table.link.use")}
              </Link>
              <IconButton
                icon={{ icon: "delete" }}
                size='large'
                appearance='dark'
                variant='flat'
                ariaLabel={t("button.delete")}
                onClick={() => {
                  analyticsClient.trackEvent({
                    event: {
                      name: ANALYTICS.template.delete.name,
                      category: ANALYTICS.template.category,
                      action: ANALYTICS.template.delete.action,
                    },
                  })
                  setToDelete({ id: template.id, name: templateName })
                }}
              />
            </Stack>
          )
        },
      },
    ],
    [analyticsClient, locale, t],
  )

  const table = useReactTable({
    data: templates ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  useEffect(() => {
    if (error) {
      toaster.create({
        title: t("toaster.title.serverError"),
        dismissible: true,
        duration: 10000,
        action: {
          href: pathname,
          label: t("toaster.action.retry"),
        },
        variant: "danger",
        position: { x: "right", y: "top" },
      })
    }
  }, [error, t, pathname])

  const handleSearchChange = (e: ChangeEvent<HTMLInputElement>) => {
    setSearchText(e.target.value)
  }

  const handleSearch = () => {
    const params = new URLSearchParams(searchParams)
    if (searchText) {
      params.set("search", searchText)
    } else {
      params.delete("search")
    }
    router.push(`?${params.toString()}`)
  }

  const handleSearchSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    handleSearch()
  }

  const handleReset = () => {
    setSearchText("")
    const params = new URLSearchParams(searchParams)
    params.delete("search")
    router.push(`?${params.toString()}`)
  }

  const newid = searchParams.get("newid")
  const triggeredToaster = useRef(false)

  useEffect(() => {
    if (!newid || triggeredToaster.current || !templates?.length) {
      return
    }

    const newTemplate = templates.find((item) => item.id === newid)
    const newTemplateContent =
      newTemplate?.contents.find((c) => c.language === locale) ??
      newTemplate?.contents.at(0)
    const newTemplateName = newTemplateContent?.templateName

    toaster.create({
      title: t("toaster.title.newTemplate", {
        name: newTemplateName ? ` '${newTemplateName}'` : "",
      }),
      dismissible: true,
      duration: 10000,
      action: {
        href: `/${locale}/send-a-message?templateId=${newid}`,
        label: t("toaster.action.yes"),
      },
      variant: "success",
      position: { x: "right", y: "top" },
    })
    triggeredToaster.current = true
    const params = new URLSearchParams(searchParams)
    params.delete("newid")
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname)
  }, [newid, templates, t, router, pathname, locale, searchParams])

  const handleDeleteClick = async () => {
    if (!toDelete.id) return
    setDeleteError(false)
    try {
      await deleteTemplate()
      setToDelete(deleteToDefault)
      refresh()
    } catch {
      setDeleteError(true)
    }
  }

  return (
    <>
      <ModalWrapper
        isOpen={Boolean(toDelete.id)}
        onClose={() => setToDelete(deleteToDefault)}
      >
        <ModalTitle>
          {t("modal.delete.title", { name: toDelete.name })}
        </ModalTitle>
        <ModalBody>
          {deleteError && (
            <FormField error={{ text: t("modal.delete.error") }} />
          )}
          <Paragraph>{t("modal.delete.body")}</Paragraph>
        </ModalBody>
        <ModalFooter>
          <Button
            disabled={isDeleting}
            variant='secondary'
            onClick={() => {
              setToDelete(deleteToDefault)
            }}
          >
            {t("button.cancel")}
          </Button>
          <Button disabled={isDeleting} onClick={handleDeleteClick}>
            {t("button.delete")} {isDeleting && <Spinner />}
          </Button>
        </ModalFooter>
      </ModalWrapper>

      <FullWidthContainer>
        <TwoColumnLayout>
          <Stack direction='column'>
            <form onSubmit={handleSearchSubmit}>
              <Stack direction='row' gap={3}>
                <TextInput
                  name='search'
                  placeholder={tSearch("input.placeholder")}
                  onChange={handleSearchChange}
                  value={searchText}
                  autoComplete='off'
                />
                <Button type='submit'>{tSearch("button.search")}</Button>
                <Button type='button' onClick={handleReset} variant='secondary'>
                  {tSearch("button.reset")}
                </Button>
              </Stack>
            </form>
          </Stack>

          <Stack itemsAlignment='end'>
            <Link
              asButton={{
                appearance: "default",
              }}
              noUnderline
              href={
                buildClientUrl({
                  locale: locale,
                  url: templateRoutes.url,
                }).href
              }
              onClick={() =>
                analyticsClient.trackEvent({
                  event: {
                    name: ANALYTICS.template.create.name,
                    category: ANALYTICS.template.category,
                    action: ANALYTICS.template.create.action,
                  },
                })
              }
            >
              {t("button.new")}
            </Link>
          </Stack>
        </TwoColumnLayout>
      </FullWidthContainer>

      <TanStackTable
        table={table}
        layout='fixed'
        isLoading={isFetching}
        emptyMessage={t("table.empty")}
        aria-label={t("table.header.name")}
      />
    </>
  )
}
