"use client"

import { useCrossZoneLink } from "@citizen-portal/shared"
import { Link, Paragraph, Stack } from "@ogcio/design-system-react"
import { useAnalytics } from "@ogcio/nextjs-analytics"
import { useAuth, useGatewayFetch } from "@ogcio/sag-client/react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { BackButton } from "@/components/button/back-button"
import { CssSpinner } from "@/components/css-spinner"
import { useFeatureFlags } from "@/components/feature-flags-provider"
import { ANALYTICS } from "@/const/analytics"
import { isFoldersEnabled, isLeaEnabled } from "@/lib/feature-config"
import { getMockAttachmentIds } from "@/mock/attachments"
import { findMockMessageById } from "@/mock/messages"
import { findMockSubmissionIdForRelatedMessage } from "@/mock/related-messages"
import type { Message } from "@/types"
import { AttachmentCard } from "./attachment-card"
import { DeleteConfirmationModal } from "./delete-confirmation-modal"
import { DELETE_FLASH_KEY, MOVE_FLASH_KEY } from "./message-action-flash-keys"
import styles from "./message-detail.module.css"
import { MessageDetailBody } from "./message-detail-body"
import { MessageDetailHeader } from "./message-detail-header"
import { MessageDetailToolbar } from "./message-detail-toolbar"
import { MoveMessageModal } from "./move-message-modal"
import { useDeleteMessages } from "./use-delete-messages"
import { useMarkMessageAsRead } from "./use-mark-message-as-read"
import { useMessageFolders } from "./use-message-folders"
import { useMoveMessages } from "./use-move-messages"

export interface MessageDetailViewProps {
  id: string
}

function buildMessageMetadataUrl(messageId: string): string {
  const params = new URLSearchParams({ includeMetadata: "true" })
  return `/messaging-public-api/api/v1/citizens/messages/${messageId}?${params.toString()}`
}

export function MessageDetailView({ id }: MessageDetailViewProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const locale = useLocale()
  const crossZone = useCrossZoneLink()
  const tMove = useTranslations("home.move.modal")
  const tDetail = useTranslations("home.detail")
  useAuth()
  const { isSubmissionLinkingEnabled } = useFeatureFlags()
  const submissionLinkingEnabled = isLeaEnabled() && isSubmissionLinkingEnabled
  const submissionIdFromUrl = searchParams.get("submissionId")

  const {
    data: apiData,
    error,
    isLoading,
  } = useGatewayFetch<Message>(`/messaging/api/v1/messages/${id}`)

  const { data: metadataMessage } = useGatewayFetch<Message>(
    submissionLinkingEnabled && !submissionIdFromUrl
      ? buildMessageMetadataUrl(id)
      : null,
  )

  const data = useMemo(() => {
    if (apiData) return apiData
    return findMockMessageById(id)
  }, [apiData, id])

  const submissionId = useMemo(() => {
    if (!submissionLinkingEnabled) return null
    if (submissionIdFromUrl) return submissionIdFromUrl
    if (metadataMessage?.metadata?.journey?.submissionId) {
      return metadataMessage.metadata.journey.submissionId
    }
    return findMockSubmissionIdForRelatedMessage(id)
  }, [
    metadataMessage?.metadata?.journey?.submissionId,
    submissionLinkingEnabled,
    submissionIdFromUrl,
    id,
  ])

  const submissionHref = useMemo(() => {
    if (!submissionId) return null
    return crossZone(
      "dashboard",
      `/${locale}/my-submissions?id=${encodeURIComponent(submissionId)}`,
    )
  }, [crossZone, locale, submissionId])

  const attachments = useMemo(
    () => (data ? getMockAttachmentIds(data) : []),
    [data],
  )

  useMarkMessageAsRead(id, Boolean(data))

  const analyticsClient = useAnalytics()
  const trackedDetail = useRef(false)
  useEffect(() => {
    if (!data || trackedDetail.current) return
    trackedDetail.current = true
    analyticsClient.trackEvent({
      event: {
        name: ANALYTICS.message.detail.name,
        category: ANALYTICS.message.category,
        action: ANALYTICS.message.detail.action,
      },
    })
  }, [data, analyticsClient])

  const foldersEnabled = isFoldersEnabled()
  const { deleteIds, isLoading: isDeleting } = useDeleteMessages()
  const { moveIds, isLoading: isMoving } = useMoveMessages()

  const [isDeleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [isMoveModalOpen, setMoveModalOpen] = useState(false)

  const currentFolderId = searchParams.get("folder")
  const destinations = useMessageFolders({
    currentFolderId,
    inboxLabel: tMove("inbox"),
  })

  const listPath = pathname.split("?")[0]
  const backHref = listPath

  const handleDelete = useCallback(async () => {
    setDeleteConfirmOpen(false)
    const result = await deleteIds([id])
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(DELETE_FLASH_KEY, JSON.stringify(result))
    }
    router.push(listPath)
  }, [deleteIds, id, listPath, router])

  const handleMove = useCallback(
    async (folderId: string | null) => {
      setMoveModalOpen(false)
      const result = await moveIds([id], folderId)
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(MOVE_FLASH_KEY, JSON.stringify(result))
      }
      router.push(listPath)
    },
    [id, listPath, moveIds, router],
  )

  if (isLoading) {
    return (
      <output
        aria-label='Loading'
        className='gi-flex gi-items-center gi-justify-center'
        style={{ minHeight: "30vh" }}
      >
        <CssSpinner size='xl' />
      </output>
    )
  }

  if (!data) {
    return (
      <div className={styles.detailRoot}>
        <Paragraph>{error?.message ?? "Message not found"}</Paragraph>
        <BackButton />
      </div>
    )
  }

  const richText = data.richText || undefined
  const plainText = data.plainText || undefined

  return (
    <div className={styles.detailRoot}>
      <MessageDetailToolbar
        backHref={backHref}
        onMove={foldersEnabled ? () => setMoveModalOpen(true) : undefined}
        onDelete={() => setDeleteConfirmOpen(true)}
        isDeleting={isDeleting}
        isMoving={isMoving}
      />

      <div className={`${styles.detailContent} o11y-replay-block`}>
        <MessageDetailHeader
          subject={data.subject}
          organisationId={data.organisationId}
          createdAt={data.createdAt}
        />

        <MessageDetailBody
          richText={richText}
          plainText={plainText}
          attachmentCount={attachments.length}
        />

        {attachments.length > 0 && (
          <AttachmentList attachmentIds={attachments} />
        )}

        {submissionLinkingEnabled && submissionId && submissionHref ? (
          <div className={styles.applicationLink}>
            <Paragraph size='sm'>
              {tDetail.rich("relatesToSubmission", {
                submissionId,
                link: (chunks) => (
                  <Link href={submissionHref} noColor>
                    {chunks}
                  </Link>
                ),
              })}
            </Paragraph>
          </div>
        ) : null}
      </div>

      <DeleteConfirmationModal
        isOpen={isDeleteConfirmOpen}
        count={1}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={handleDelete}
        isDeleting={isDeleting}
      />

      {foldersEnabled ? (
        <MoveMessageModal
          isOpen={isMoveModalOpen}
          onClose={() => setMoveModalOpen(false)}
          onConfirm={handleMove}
          destinations={destinations}
          isMoving={isMoving}
        />
      ) : null}
    </div>
  )
}

function AttachmentList({ attachmentIds }: { attachmentIds: string[] }) {
  return (
    <Stack direction='column' gap={2}>
      {attachmentIds.map((attachmentId) => (
        <AttachmentCard key={attachmentId} id={attachmentId} />
      ))}
    </Stack>
  )
}
