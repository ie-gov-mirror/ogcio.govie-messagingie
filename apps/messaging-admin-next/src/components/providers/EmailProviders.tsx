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
  toaster,
} from "@ogcio/design-system-react"
import { useGatewayFetch, useGatewayMutation } from "@ogcio/sag-client/react"
import {
  type ColumnDef,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { useLocale, useTranslations } from "next-intl"
import { useEffect, useMemo, useState } from "react"
import { TanStackTable } from "@/components/tables/TanStackTable"
import { useOrganizationId } from "@/hooks/use-organization-id"
import { messagingApi } from "@/util/api-paths"
import { providerRoutes } from "@/util/routes"
import { buildClientUrlWithSearchParams } from "@/util/url-utils.client"

type EmailProviderRow = {
  id: string
  providerName: string
  isPrimary?: boolean
}

const deleteToDefault: { id: string; name: string } = Object.freeze({
  id: "",
  name: "",
})

export default function EmailProviders() {
  const t = useTranslations("settings.Emails")
  const locale = useLocale()
  const organizationId = useOrganizationId()

  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [toDelete, setToDelete] =
    useState<typeof deleteToDefault>(deleteToDefault)
  const [deleteError, setDeleteError] = useState(false)

  const {
    data: providers,
    error: providerFetchError,
    isLoading,
    refresh,
  } = useGatewayFetch<EmailProviderRow[]>(messagingApi.providers())

  const deletePath = toDelete.id
    ? messagingApi.deleteProvider(toDelete.id)
    : null

  const { trigger: deleteProvider, isLoading: isDeleting } =
    useGatewayMutation<unknown>(deletePath, {
      method: "DELETE",
      organizationId,
    })

  const columns = useMemo<ColumnDef<EmailProviderRow>[]>(
    () => [
      {
        id: "name",
        header: t("nameTableHeader"),
        meta: { size: "fluid" },
        accessorKey: "providerName",
      },
      {
        id: "primary",
        header: t("primaryHeader"),
        meta: { size: "sm-fixed" },
        cell: ({ row }) =>
          row.original.isPrimary ? t("primaryCellValue") : null,
      },
      {
        id: "links",
        header: t("linksTableHeader"),
        meta: { size: "sm-fixed" },
        cell: ({ row }) => (
          <Link
            href={
              buildClientUrlWithSearchParams({
                dir: `${locale}/${providerRoutes.url}/email`,
                searchParams: { id: row.original.id },
              }).href
            }
          >
            {t("editLink")}
          </Link>
        ),
      },
      {
        id: "actions",
        header: t("actionsTableHeader"),
        meta: { size: "sm-fixed" },
        cell: ({ row }) => (
          <IconButton
            icon={{ icon: "delete" }}
            appearance='dark'
            variant='flat'
            size='large'
            ariaLabel={t("deleteButton")}
            onClick={() => {
              setToDelete({
                id: row.original.id,
                name: row.original.providerName,
              })
              setDeleteModalOpen(true)
            }}
          />
        ),
      },
    ],
    [locale, t],
  )

  const table = useReactTable({
    data: providers ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  useEffect(() => {
    if (providerFetchError) {
      toaster.create({
        title: t("genericServerError"),
        position: {
          x: "right",
          y: "top",
        },
        variant: "danger",
      })
    }
  }, [providerFetchError, t])

  const handleDeleteClick = async () => {
    if (!toDelete.id) return
    setDeleteError(false)
    try {
      await deleteProvider()
      setToDelete(deleteToDefault)
      setDeleteModalOpen(false)
      refresh()
    } catch {
      setDeleteError(true)
    }
  }

  return (
    <>
      <ModalWrapper
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
      >
        <ModalTitle>
          {t("deleteModalTitle", { name: toDelete.name })}
        </ModalTitle>
        <ModalBody>
          <FormField
            error={deleteError ? { text: t("failedToDelete") } : undefined}
          />
          <Paragraph>{t("deleteModalBody")}</Paragraph>
        </ModalBody>

        <ModalFooter>
          <Button
            variant='secondary'
            onClick={() => {
              setToDelete(deleteToDefault)
              setDeleteModalOpen(false)
            }}
            disabled={isDeleting}
          >
            {t("modalCancel")}
          </Button>

          <Button
            variant='primary'
            onClick={handleDeleteClick}
            disabled={isDeleting}
          >
            {t("modalDelete")} {isDeleting && <Spinner />}
          </Button>
        </ModalFooter>
      </ModalWrapper>
      <TanStackTable
        table={table}
        errorMessage={providerFetchError ? t("genericServerError") : undefined}
        emptyMessage={
          !isLoading && providers?.length === 0 ? t("noProviders") : undefined
        }
        aria-label={t("nameTableHeader")}
      />
    </>
  )
}
