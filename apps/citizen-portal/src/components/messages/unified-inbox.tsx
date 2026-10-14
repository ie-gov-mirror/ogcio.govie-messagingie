"use client"

import { Button, Stack } from "@ogcio/design-system-react"
import { useAnalytics } from "@ogcio/nextjs-analytics"
import { usePathname, useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { DELETED_FOLDER_ID, INBOX_FOLDER_ID } from "@/api/messages"
import { ANALYTICS } from "@/const/analytics"
import { useIsMobile } from "@/hooks/use-is-mobile"
import { useUrlSearchParams } from "@/hooks/use-url-search-params"
import { isFoldersEnabled } from "@/lib/feature-config"
import { BulkActionToolbar } from "./bulk-action-toolbar"
import { DeleteConfirmationModal } from "./delete-confirmation-modal"
import { DeleteResultToast } from "./delete-result-toast"
import { InboxLayout } from "./inbox-layout"
import { InboxListChromeHeader } from "./inbox-list-chrome-header"
import { DELETE_FLASH_KEY, MOVE_FLASH_KEY } from "./message-action-flash-keys"
import { MessageDetailView } from "./message-detail-view"
import { MessageFoldersSidebar } from "./message-folders-sidebar"
import { MobileFolderPanel } from "./mobile-folder-panel"
import { MoveMessageModal } from "./move-message-modal"
import { MoveResultToast } from "./move-result-toast"
import { DEFAULT_PAGE_SIZE, parsePageSize } from "./page-size"
import styles from "./unified-inbox.module.css"
import { UnifiedInboxTable } from "./unified-inbox-table"
import tableStyles from "./unified-inbox-table.module.css"
import {
  type DeleteMessagesResult,
  useDeleteMessages,
} from "./use-delete-messages"
import { useInboxMessages } from "./use-inbox-messages"
import { useMessageFolders } from "./use-message-folders"
import { useMessageSelection } from "./use-message-selection"
import { type MoveMessagesResult, useMoveMessages } from "./use-move-messages"

export function UnifiedInboxPage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useUrlSearchParams()
  const selectedId = searchParams.get("id")

  const selectMessage = useCallback(
    (id: string) => {
      const params = new URLSearchParams(searchParams)
      params.set("id", id)
      router.push(`${pathname}?${params.toString()}`, { scroll: false })
    },
    [router, pathname, searchParams],
  )

  const foldersEnabled = isFoldersEnabled()
  const sidebar = foldersEnabled ? <MessageFoldersSidebar /> : null

  if (selectedId) {
    return (
      <InboxLayout sidebar={sidebar}>
        <MessageDetailView id={selectedId} />
      </InboxLayout>
    )
  }

  return (
    <InboxLayout sidebar={sidebar}>
      <UnifiedInboxListView onSelect={selectMessage} />
    </InboxLayout>
  )
}

function UnifiedInboxListView({
  onSelect,
}: {
  onSelect: (id: string) => void
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useUrlSearchParams()
  const tMove = useTranslations("home.move")

  const analyticsClient = useAnalytics()
  const trackedListView = useRef(false)
  useEffect(() => {
    if (trackedListView.current) return
    trackedListView.current = true
    analyticsClient.trackEvent({
      event: {
        name: ANALYTICS.message.listView.name,
        category: ANALYTICS.message.category,
        action: ANALYTICS.message.listView.action,
      },
    })
  }, [analyticsClient])

  const isMobile = useIsMobile()
  const foldersEnabled = isFoldersEnabled()
  const search = searchParams.get("search")
  const status = searchParams.get("status") || "all"
  const page = Number(searchParams.get("page")) || 1
  const pageSize = parsePageSize(searchParams.get("limit"))
  const folderId = foldersEnabled ? searchParams.get("folder") : null
  const isInboxView = !folderId || folderId === INBOX_FOLDER_ID
  const isDeletedView = folderId === DELETED_FOLDER_ID

  const handlePageSizeChange = useCallback(
    (size: number) => {
      const params = new URLSearchParams(searchParams)
      if (size === DEFAULT_PAGE_SIZE) {
        params.delete("limit")
      } else {
        params.set("limit", String(size))
      }
      params.delete("page")
      const qs = params.toString()
      router.push(qs ? `${pathname}?${qs}` : pathname)
    },
    [router, pathname, searchParams],
  )

  // Desktop keeps `?page=`-based pagination; mobile switches to infinite
  // scroll, accumulating pages as the user reaches the end of the card list.
  const {
    messages,
    totalCount,
    isLoading,
    isLoadingMore,
    hasMore,
    loadMore,
    refresh,
  } = useInboxMessages({ isMobile, search, status, folderId, page, pageSize })

  const selection = useMessageSelection(messages)
  const {
    deleteIds,
    isLoading: isDeleting,
    lastResult: deleteLastResult,
    dismissResult: dismissDeleteResult,
  } = useDeleteMessages({ onSettled: () => refresh() })
  const {
    moveIds,
    isLoading: isMoving,
    lastResult: moveLastResult,
    dismissResult: dismissMoveResult,
  } = useMoveMessages({ onSettled: () => refresh() })

  // Destinations exclude the current folder; the Deleted view is never a move
  // source, so Move is hidden there regardless of available folders.
  const currentFolderId = isInboxView ? null : folderId
  const destinations = useMessageFolders({
    currentFolderId,
    inboxLabel: tMove("modal.inbox"),
  })
  const canMove = foldersEnabled && !isDeletedView && destinations.length > 0

  const [deleteFlashResult, setDeleteFlashResult] =
    useState<DeleteMessagesResult | null>(null)
  const [moveFlashResult, setMoveFlashResult] =
    useState<MoveMessagesResult | null>(null)
  const [pendingIds, setPendingIds] = useState<string[] | null>(null)
  const [isMoveModalOpen, setMoveModalOpen] = useState(false)
  const [isFolderPanelOpen, setFolderPanelOpen] = useState(false)
  const [selectMode, setSelectMode] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined") return

    const deleteRaw = window.sessionStorage.getItem(DELETE_FLASH_KEY)
    if (deleteRaw) {
      try {
        setDeleteFlashResult(JSON.parse(deleteRaw) as DeleteMessagesResult)
      } catch {
        // Ignore malformed values silently.
      } finally {
        window.sessionStorage.removeItem(DELETE_FLASH_KEY)
      }
    }

    const moveRaw = window.sessionStorage.getItem(MOVE_FLASH_KEY)
    if (moveRaw) {
      try {
        setMoveFlashResult(JSON.parse(moveRaw) as MoveMessagesResult)
      } catch {
        // Ignore malformed values silently.
      } finally {
        window.sessionStorage.removeItem(MOVE_FLASH_KEY)
      }
    }
  }, [])

  const activeDeleteResult = deleteLastResult ?? deleteFlashResult
  const activeMoveResult = moveLastResult ?? moveFlashResult

  const handleDismissDeleteResult = useCallback(() => {
    setDeleteFlashResult(null)
    dismissDeleteResult()
  }, [dismissDeleteResult])

  const handleDismissMoveResult = useCallback(() => {
    setMoveFlashResult(null)
    dismissMoveResult()
  }, [dismissMoveResult])

  const openDeleteConfirmation = useCallback((ids: string[]) => {
    if (ids.length === 0) return
    setPendingIds(ids)
  }, [])

  const confirmDelete = useCallback(async () => {
    if (!pendingIds) return
    const ids = pendingIds
    setPendingIds(null)
    const result = await deleteIds(ids)
    if (result.ok) {
      selection.clear()
      setSelectMode(false)
    }
  }, [pendingIds, deleteIds, selection])

  const handleMove = useCallback(
    async (destFolderId: string | null) => {
      setMoveModalOpen(false)
      const ids = Array.from(selection.selectedIds)
      if (ids.length === 0) return
      const result = await moveIds(ids, destFolderId)
      if (result.ok) {
        selection.clear()
        setSelectMode(false)
      }
    },
    [moveIds, selection],
  )

  const bulkActionBar = useMemo(
    () =>
      selection.selectedCount > 0 ? (
        <BulkActionToolbar
          selectedCount={selection.selectedCount}
          onDelete={() =>
            openDeleteConfirmation(Array.from(selection.selectedIds))
          }
          onClearSelection={() => {
            selection.clear()
            setSelectMode(false)
          }}
          extraActions={
            canMove ? (
              <Button
                data-testid='bulk-move-button'
                variant='secondary'
                appearance='light'
                size='small'
                onClick={() => setMoveModalOpen(true)}
              >
                {tMove("moveTo")}
              </Button>
            ) : null
          }
        />
      ) : null,
    [
      selection.selectedCount,
      selection.selectedIds,
      openDeleteConfirmation,
      canMove,
      tMove,
    ],
  )

  return (
    <div className={styles.listRoot}>
      <Stack
        direction='column'
        gap={6}
        itemsAlignment='stretch'
        className={styles.inboxStack}
      >
        <DeleteResultToast
          result={activeDeleteResult}
          onDismiss={handleDismissDeleteResult}
        />
        <MoveResultToast
          result={activeMoveResult}
          onDismiss={handleDismissMoveResult}
        />
        <div className={styles.mobileFullBleed}>
          <div className={tableStyles.listChrome}>
            <InboxListChromeHeader
              showToolbar={selection.selectedCount > 0}
              bulkActionBar={bulkActionBar}
            />
            <UnifiedInboxTable
              messages={messages}
              isLoading={isLoading}
              totalCount={totalCount}
              onSelect={onSelect}
              pageSize={pageSize}
              onPageSizeChange={handlePageSizeChange}
              hasMore={hasMore}
              isLoadingMore={isLoadingMore}
              onLoadMore={loadMore}
              selection={selection}
              selectMode={selectMode}
              onEnterSelectMode={() => setSelectMode(true)}
              onExitSelectMode={() => setSelectMode(false)}
              onBulkDelete={() =>
                openDeleteConfirmation(Array.from(selection.selectedIds))
              }
              onOpenFolders={
                foldersEnabled ? () => setFolderPanelOpen(true) : undefined
              }
              onBulkMove={() => setMoveModalOpen(true)}
              canMove={canMove}
            />
          </div>
        </div>
        <DeleteConfirmationModal
          isOpen={pendingIds !== null}
          count={pendingIds?.length ?? 0}
          onClose={() => setPendingIds(null)}
          onConfirm={confirmDelete}
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
        {foldersEnabled ? (
          <MobileFolderPanel
            isOpen={isFolderPanelOpen}
            onClose={() => setFolderPanelOpen(false)}
          />
        ) : null}
      </Stack>
    </div>
  )
}
