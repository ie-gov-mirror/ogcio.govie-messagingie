"use client"

import {
  Button,
  FormField,
  Heading,
  InputText,
  Pagination,
  Paragraph,
  Spinner,
  Stack,
  TabItem,
  TabList,
  TabPanel,
  Tabs,
  Tooltip,
  toaster,
} from "@ogcio/design-system-react"
import { useAnalytics } from "@ogcio/nextjs-analytics"
import {
  useGatewayFetch,
  useGatewayMutation,
  useSagClient,
} from "@ogcio/sag-client/react"
import { useTable } from "@tanstack/react-table"
import { useRouter, useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { useContext, useEffect, useMemo, useRef, useState } from "react"
import { BackButton } from "@/components/BackButton"
import { FullWidthContainer } from "@/components/containers"
import { AddCircleIcon } from "@/components/icons/add-circle"
import { DeleteIcon } from "@/components/icons/delete"
import { TanStackTable } from "@/components/tables/TanStackTable"
import { type Column, features } from "@/components/tables/table-features"
import { ANALYTICS } from "@/const/analytics"
import { useOrganizationId } from "@/hooks/use-organization-id"
import type { ProfilePayload } from "@/types/types"
import { messagingApi } from "@/util/api-paths"
import { defaultFormGap } from "@/util/datetime"
import { offsetToPage, pageToOffset } from "@/util/pagination"
import { SendMessageContext } from "./SendMessageContext"

const pageSize = 5
const retryTimeoutSeconds = 30
const pollingIntervalMs = 1000

type SelectedRecipient = { id: string; publicName: string; email: string }

type ProfileListMetadata = {
  totalCount?: number
  links?: { pages?: Record<string, string> }
}

function canReceiveMessages(profile: ProfilePayload): boolean {
  return (
    isProfileActive(profile.status) &&
    isConsentingToMessaging(profile.consentStatuses)
  )
}

function isProfileActive(profileStatus: ProfilePayload["status"]): boolean {
  return profileStatus === "active"
}

function isConsentingToMessaging(
  consentStatuses: ProfilePayload["consentStatuses"],
): boolean {
  if (!consentStatuses?.messaging) {
    return true
  }

  const optedOutStatuses = ["opted-out", "pending", "undefined"]

  if (optedOutStatuses.includes(consentStatuses.messaging?.status ?? "")) {
    return false
  }

  return true
}

function totalPagesFromMetadata(metadata?: ProfileListMetadata): number {
  if (metadata?.totalCount != null) {
    return Math.max(1, Math.ceil(metadata.totalCount / pageSize))
  }
  return (
    Number(
      Object.keys(metadata?.links?.pages || {})
        .sort((a, b) => Number(a) - Number(b))
        .at(-1),
    ) || 1
  )
}

export default function Recipients() {
  const { message, onStep, canCreateProfiles } = useContext(SendMessageContext)
  const tRecipient = useTranslations("message.wizard.step.recipient")
  const tSearch = useTranslations("search")
  const analyticsClient = useAnalytics()
  const organizationId = useOrganizationId()
  const client = useSagClient()
  const fetchOpts = useMemo(
    () => (organizationId ? { organizationId } : undefined),
    [organizationId],
  )
  const pollEmailRef = useRef("")

  useEffect(() => {
    analyticsClient.trackEvent({
      event: {
        name: ANALYTICS.message.stepRecipients.name,
        category: ANALYTICS.message.category,
        action: ANALYTICS.message.stepRecipients.action,
      },
    })
  }, [analyticsClient])

  const [selectedRecipients, setSelectedRecipients] = useState<
    SelectedRecipient[]
  >([])
  const [isAdding, setIsAdding] = useState<boolean>(false)

  const searchParams = useSearchParams()
  const router = useRouter()

  const recipientsPath = useMemo(
    () =>
      messagingApi.profileList({
        limit: pageSize,
        offset: Number(searchParams.get("offset")) || 0,
        email: searchParams.get("email")?.toString(),
        firstName: searchParams.get("firstName")?.toString(),
        lastName: searchParams.get("surname")?.toString(),
        consentSubjects: "messaging",
      }),
    [searchParams],
  )

  const {
    data: users = [],
    metadata,
    error: recipientsError,
    refresh,
  } = useGatewayFetch<ProfilePayload[], ProfileListMetadata>(recipientsPath)

  const { trigger: createProfile } = useGatewayMutation<
    unknown,
    {
      profiles: Array<{
        email: string
        firstName: string
        lastName: string
      }>
    }
  >(messagingApi.createProfile(), { method: "POST", organizationId })

  useEffect(() => {
    if (recipientsError) {
      toaster.create({
        position: {
          x: "right",
          y: "top",
        },
        title: tRecipient("toast.error.databaseFetch"),
        dismissible: true,
        variant: "danger",
      })
    }
  }, [recipientsError, tRecipient])

  const totalPages = totalPagesFromMetadata(metadata)

  const onNextStep = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    return onStep(
      {
        ...message,
        userIds: selectedRecipients.map((item) => item.id),
      },
      "next",
    )
  }

  const handlePageChange = (page: number) => {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set("offset", pageToOffset(page, pageSize).toString())
    router.push(`?${nextParams.toString()}`)
  }

  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set("firstName", (formData.get("firstName") as string) ?? "")
    nextParams.set("surname", (formData.get("surname") as string) ?? "")
    nextParams.set("email", (formData.get("email") as string) ?? "")
    nextParams.delete("offset")
    router.push(`?${nextParams.toString()}`)
  }

  const handleClearSearch = (e: React.FormEvent<HTMLButtonElement>) => {
    e.preventDefault()
    const nextParams = new URLSearchParams(searchParams)
    nextParams.delete("offset")
    nextParams.delete("email")
    nextParams.delete("surname")
    nextParams.delete("firstName")
    const form = document.querySelector<HTMLFormElement>("form#searchform")
    for (const inp of form?.querySelectorAll("input") || []) {
      inp.value = ""
    }
    router.push(`?${nextParams.toString()}`)
  }

  const handleClearAdd = (e: React.FormEvent<HTMLButtonElement>) => {
    e.preventDefault()
    const form = document.querySelector<HTMLFormElement>("form#addform")
    for (const el of form?.querySelectorAll("input") || []) {
      el.value = ""
    }
  }

  useEffect(() => {
    if (!isAdding) return

    const email = pollEmailRef.current
    if (!email) {
      setIsAdding(false)
      return
    }

    let cancelled = false
    let retriesLeft = retryTimeoutSeconds
    let timeoutId: ReturnType<typeof setTimeout>

    const pollForRecipient = async () => {
      if (cancelled) return

      try {
        const body = await client.fetch<ProfilePayload[]>(
          messagingApi.profileList({
            email,
            limit: 1,
            consentSubjects: "messaging",
          }),
          fetchOpts,
        )
        const recipient = body?.data?.at(0)

        if (recipient) {
          if (!isConsentingToMessaging(recipient.consentStatuses)) {
            toaster.create({
              dismissible: true,
              position: { x: "right", y: "top" },
              variant: "danger",
              title: tRecipient("toast.error.consentDisabled", { email }),
            })
            setIsAdding(false)
            return
          }

          setSelectedRecipients((state) => [
            {
              id: recipient.id,
              email: recipient.email,
              publicName: recipient.publicName,
            },
            ...state,
          ])

          toaster.create({
            dismissible: true,
            position: { x: "right", y: "top" },
            variant: "success",
            title: tRecipient("toast.success.add", {
              publicName: recipient.publicName,
              email: recipient.email,
            }),
          })

          setIsAdding(false)
          void refresh()
          return
        }
      } catch {
        if (!cancelled) {
          toaster.create({
            dismissible: true,
            position: { x: "right", y: "top" },
            variant: "danger",
            title: tRecipient("toast.error.databaseFetch"),
          })
          setIsAdding(false)
        }
        return
      }

      retriesLeft -= 1
      if (retriesLeft <= 0) {
        if (!cancelled) {
          toaster.create({
            dismissible: true,
            position: { x: "right", y: "top" },
            variant: "danger",
            title: tRecipient("toast.error.timeout"),
          })
          setIsAdding(false)
        }
        return
      }

      timeoutId = setTimeout(pollForRecipient, pollingIntervalMs)
    }

    void pollForRecipient()

    return () => {
      cancelled = true
      clearTimeout(timeoutId)
    }
  }, [isAdding, client, fetchOpts, refresh, tRecipient])

  const handleAddRecipient = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const firstName = formData.get("firstName") as string
    const surname = formData.get("surname") as string
    const email = formData.get("email") as string

    pollEmailRef.current = email
    setIsAdding(true)

    try {
      const checkBody = await client.fetch<ProfilePayload[]>(
        messagingApi.profileList({
          email,
          limit: 1,
          consentSubjects: "messaging",
        }),
        fetchOpts,
      )
      const existing = checkBody?.data ?? []

      if (existing.length) {
        toaster.create({
          dismissible: true,
          position: {
            x: "right",
            y: "top",
          },
          variant: "danger",
          title: tRecipient("toast.error.emailExists", { email }),
        })

        if (!canReceiveMessages(existing[0])) {
          toaster.create({
            dismissible: true,
            position: {
              x: "right",
              y: "top",
            },
            variant: "danger",
            title: tRecipient("toast.error.consentDisabled", { email }),
          })
        }

        setIsAdding(false)
        return
      }

      await createProfile({
        profiles: [
          {
            email,
            firstName,
            lastName: surname,
          },
        ],
      })
    } catch {
      toaster.create({
        dismissible: true,
        position: {
          x: "right",
          y: "top",
        },
        variant: "danger",
        title: tRecipient("toast.error.database"),
      })
      setIsAdding(false)
    }
  }

  const availableColumns = useMemo<Column<ProfilePayload>[]>(
    () => [
      {
        id: "recipient",
        header: tRecipient("table.header.availableRecipients"),
        meta: { size: "fluid" },
        accessorFn: (row) => `${row.publicName} <${row.email}>`,
      },
      {
        id: "consent",
        header: tRecipient("table.header.consentStatus"),
        meta: { size: "md-fixed" },
        accessorFn: (row) =>
          tRecipient(
            `table.${isConsentingToMessaging(row.consentStatuses) ? "consentEnabled" : "consentDisabled"}`,
          ),
      },
      {
        id: "actions",
        header: users.length ? tRecipient("table.header.actions") : "",
        meta: { size: "sm-fixed" },
        cell: ({ row }) => {
          const user = row.original
          return canReceiveMessages(user) ? (
            <Button
              disabled={selectedRecipients.some((rcp) => rcp.id === user.id)}
              variant='flat'
              appearance='dark'
              ariaLabel={tRecipient("button.arialabel.addRecipient")}
              onClick={() => {
                setSelectedRecipients([
                  {
                    id: user.id,
                    email: user.email,
                    publicName: user.publicName,
                  },
                  ...selectedRecipients,
                ])
              }}
            >
              <AddCircleIcon />
            </Button>
          ) : (
            <Tooltip position='top' text={tRecipient("tooltip.disabled")}>
              <Button
                disabled={true}
                variant='flat'
                appearance='dark'
                ariaLabel={tRecipient("button.arialabel.addRecipient")}
              >
                <AddCircleIcon />
              </Button>
            </Tooltip>
          )
        },
      },
    ],
    [selectedRecipients, tRecipient, users.length],
  )

  const selectedColumns = useMemo<Column<SelectedRecipient>[]>(
    () => [
      {
        id: "recipient",
        header: tRecipient("table.header.selectedRecipients"),
        meta: { size: "fluid" },
        accessorFn: (row) => `${row.publicName} <${row.email}>`,
      },
      {
        id: "actions",
        header: selectedRecipients.length
          ? tRecipient("table.header.actions")
          : "",
        meta: { size: "sm-fixed" },
        cell: ({ row }) => (
          <Button
            variant='flat'
            appearance='dark'
            ariaLabel={tRecipient("button.arialabel.removeRecipient")}
            onClick={() => {
              setSelectedRecipients(
                selectedRecipients.filter((rcp) => rcp.id !== row.original.id),
              )
            }}
          >
            <DeleteIcon />
          </Button>
        ),
      },
    ],
    [selectedRecipients, tRecipient],
  )

  const availableTable = useTable({
    features,
    data: users,
    columns: availableColumns,
  })

  const selectedTable = useTable({
    features,
    data: selectedRecipients,
    columns: selectedColumns,
  })

  return (
    <Stack direction='column' gap={defaultFormGap}>
      <Heading>{tRecipient("heading.main")}</Heading>
      <Paragraph whitespace='pre-wrap'>
        {tRecipient("paragraph.main")}
      </Paragraph>

      <FullWidthContainer>
        <Tabs ariaLabelledBy='something' id='pingpong'>
          <TabList>
            <TabItem value='s'>{tRecipient("tab.item.search")}</TabItem>
            {canCreateProfiles && (
              <TabItem value='a'>{tRecipient("tab.item.add")}</TabItem>
            )}
          </TabList>
          <TabPanel value='s'>
            <Stack direction='column' gap={defaultFormGap}>
              <form
                onSubmit={handleSearch}
                style={{ width: "100%" }}
                className='gi-flex gi-flex-wrap gi-gap-3 gi-items-end gi-w-100'
                id='searchform'
              >
                <div>
                  <FormField
                    label={{
                      text: tRecipient("label.firstName"),
                      htmlFor: "firstName",
                    }}
                  >
                    <InputText
                      type='text'
                      autoComplete='off'
                      defaultValue={searchParams.get("firstName") || ""}
                      name='firstName'
                      id='firstName'
                    />
                  </FormField>
                </div>
                <div>
                  <FormField
                    label={{
                      text: tRecipient("label.surname"),
                      htmlFor: "surname",
                    }}
                  >
                    <InputText
                      name='surname'
                      id='surname'
                      type='text'
                      autoComplete='off'
                      defaultValue={searchParams.get("surname") || ""}
                    />
                  </FormField>
                </div>
                <div style={{ flexGrow: 1 }}>
                  <FormField
                    label={{
                      text: tRecipient("label.email"),
                      htmlFor: "email",
                    }}
                  >
                    <InputText
                      id='email'
                      name='email'
                      type='text'
                      autoComplete='off'
                      defaultValue={searchParams.get("email") || ""}
                    />
                  </FormField>
                </div>
                <Button type='submit'>{tSearch("button.search")}</Button>
                <Button
                  type='button'
                  variant='secondary'
                  onClick={handleClearSearch}
                >
                  {tSearch("button.reset")}
                </Button>
              </form>
              <TanStackTable
                table={availableTable}
                layout='fixed'
                emptyMessage={tRecipient("table.empty")}
                emptyClassName='gi-table-no-data'
                aria-label={tRecipient("table.header.availableRecipients")}
              />
              {totalPages > 0 && (
                <Pagination
                  currentPage={offsetToPage(
                    Number(searchParams.get("offset")) || 0,
                    Number(searchParams.get("limit")) || pageSize,
                  )}
                  onPageChange={handlePageChange}
                  totalPages={totalPages}
                />
              )}
            </Stack>
          </TabPanel>

          {canCreateProfiles && (
            <TabPanel value='a'>
              <form
                onSubmit={handleAddRecipient}
                style={{ width: "100%" }}
                className='gi-flex gi-flex-wrap gi-gap-3 gi-items-end gi-w-100'
                id='addform'
              >
                <div>
                  <FormField
                    label={{
                      text: tRecipient("label.firstName"),
                      htmlFor: "firstNameNew",
                    }}
                  >
                    <InputText
                      type='text'
                      autoComplete='off'
                      id='firstNameNew'
                      name='firstName'
                    />
                  </FormField>
                </div>
                <div>
                  <FormField
                    label={{
                      text: tRecipient("label.surname"),
                      htmlFor: "surnameNew",
                    }}
                  >
                    <InputText
                      id='surnameNew'
                      name='surname'
                      type='text'
                      autoComplete='off'
                    />
                  </FormField>
                </div>
                <div style={{ flexGrow: 1 }}>
                  <FormField
                    label={{
                      text: tRecipient("label.email"),
                      htmlFor: "emailNew",
                    }}
                  >
                    <InputText
                      name='email'
                      id='emailNew'
                      type='text'
                      autoComplete='off'
                    />
                  </FormField>
                </div>
                <Button type='submit' disabled={isAdding}>
                  {tRecipient("button.importUser")}
                  {isAdding ? <Spinner /> : <AddCircleIcon />}
                </Button>
                <Button
                  type='button'
                  onClick={handleClearAdd}
                  variant='secondary'
                  disabled={isAdding}
                >
                  {tSearch("button.reset")}
                </Button>
              </form>
            </TabPanel>
          )}
        </Tabs>
      </FullWidthContainer>

      <TanStackTable
        table={selectedTable}
        layout='fixed'
        emptyMessage={tRecipient("table.empty")}
        emptyClassName='gi-table-no-data'
        aria-label={tRecipient("table.header.selectedRecipients")}
      />

      <form onSubmit={onNextStep}>
        <Button type='submit' disabled={!selectedRecipients.length}>
          {tRecipient("button.continue")}
        </Button>
      </form>

      <BackButton onClick={() => onStep(message, "previous")}>
        {tRecipient("button.back")}
      </BackButton>
    </Stack>
  )
}
