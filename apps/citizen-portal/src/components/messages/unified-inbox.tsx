"use client"

import { Alert, Button, Paragraph, Stack } from "@ogcio/design-system-react"
import { usePathname, useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { DELETED_FOLDER_ID, INBOX_FOLDER_ID } from "@/api/messages"
import pageTitleStyles from "@/components/page-title.module.css"
import { ANALYTICS } from "@/const/analytics"
import { useIsMobile } from "@/hooks/use-is-mobile"
import { useSearchTracking } from "@/hooks/use-search-tracking"
import { useTrack } from "@/hooks/use-track"
import { useUrlSearchParams } from "@/hooks/use-url-search-params"
import { isFoldersEnabled } from "@/lib/feature-config"
import { BulkActionToolbar } from "./bulk-action-toolbar"
import { DeleteConfirmationModal } from "./delete-confirmation-modal"
import { DeleteResultToast } from "./delete-result-toast"
import { InboxLayout } from "./inbox-layout"
import { InboxListChromeHeader } from "./inbox-list-chrome-header"
import {
  DELETE_FLASH_KEY,
  MOVE_FLASH_KEY,
  RESTORE_ERASE_FLASH_KEY,
} from "./message-action-flash-keys"
import { MessageDetailView } from "./message-detail-view"
import { MessagesViewTabs } from "./messages-view-tabs"
import { MoveMessageModal } from "./move-message-modal"
import { MoveResultToast } from "./move-result-toast"
import { DEFAULT_PAGE_SIZE, parsePageSize } from "./page-size"
import {
  type RestoreEraseAction,
  RestoreEraseResultToast,
} from "./restore-erase-result-toast"
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
import {
  type RestoreEraseResult,
  useEraseMessages,
  useRestoreMessages,
} from "./use-restore-erase-messages"

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

  if (selectedId) {
    return (
      <InboxLayout>
        <MessageDetailView id={selectedId} />
      </InboxLayout>
    )
  }

  return (
    <InboxLayout>
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
  const t = useTranslations("home")
  const tMove = useTranslations("home.move")

  const track = useTrack()
  const trackedListView = useRef(false)
  useEffect(() => {
    if (trackedListView.current) return
    trackedListView.current = true
    track.event(ANALYTICS.message.listView)
  }, [track])

  const isMobile = useIsMobile()
  const foldersEnabled = isFoldersEnabled()
  const search = searchParams.get("search")
  const status = searchParams.get("status") || "all"
  const page = Number(searchParams.get("page")) || 1
  const pageSize = parsePageSize(searchParams.get("limit"))
  const requestedFolder = searchParams.get("folder")
  // Inbox and Deleted are the list's own folders. Custom folders stay behind
  // the flag; the sidebar that used to reach them is gone.
  const folderId = foldersEnabled
    ? requestedFolder
    : requestedFolder === DELETED_FOLDER_ID
      ? DELETED_FOLDER_ID
      : null
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
  useSearchTracking(ANALYTICS.search.messages, search, {
    isLoading,
    totalCount,
  })

  // Nothing to search, filter or select in this folder: an alert replaces the
  // list chrome. Only once the request has settled, so it never flashes.
  const hasNoMessages =
    !isLoading &&
    messages.length === 0 &&
    totalCount === 0 &&
    !search &&
    status === "all"
  const tEmpty = useTranslations("home.empty")
  const emptyCopy = isInboxView
    ? { title: tEmpty("inbox.title"), description: tEmpty("inbox.description") }
    : isDeletedView
      ? {
          title: tEmpty("deleted.title"),
          description: tEmpty("deleted.description"),
        }
      : {
          title: tEmpty("folder.title"),
          description: tEmpty("folder.description"),
        }

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

  const {
    run: restoreIds,
    lastResult: restoreLastResult,
    dismissResult: dismissRestoreResult,
  } = useRestoreMessages({ onSettled: () => refresh() })
  const {
    run: eraseIds,
    isLoading: isErasing,
    lastResult: eraseLastResult,
    dismissResult: dismissEraseResult,
  } = useEraseMessages({ onSettled: () => refresh() })

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
  const [restoreEraseFlash, setRestoreEraseFlash] = useState<
    (RestoreEraseResult & { action: RestoreEraseAction }) | null
  >(null)
  const [pendingIds, setPendingIds] = useState<string[] | null>(null)
  const [pendingEraseIds, setPendingEraseIds] = useState<string[] | null>(null)
  const [isMoveModalOpen, setMoveModalOpen] = useState(false)
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

    const restoreEraseRaw = window.sessionStorage.getItem(
      RESTORE_ERASE_FLASH_KEY,
    )
    if (restoreEraseRaw) {
      try {
        setRestoreEraseFlash(JSON.parse(restoreEraseRaw))
      } catch {
        // Ignore malformed values silently.
      } finally {
        window.sessionStorage.removeItem(RESTORE_ERASE_FLASH_KEY)
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

  const flashFor = (action: RestoreEraseAction) =>
    restoreEraseFlash?.action === action ? restoreEraseFlash : null

  const handleDismissRestore = useCallback(() => {
    setRestoreEraseFlash(null)
    dismissRestoreResult()
  }, [dismissRestoreResult])

  const handleDismissErase = useCallback(() => {
    setRestoreEraseFlash(null)
    dismissEraseResult()
  }, [dismissEraseResult])

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

  const finishDeletedAction = useCallback(
    (result: RestoreEraseResult) => {
      if (!result.ok) return
      selection.clear()
      setSelectMode(false)
    },
    [selection],
  )

  const handleRestore = useCallback(async () => {
    finishDeletedAction(await restoreIds(Array.from(selection.selectedIds)))
  }, [restoreIds, selection.selectedIds, finishDeletedAction])

  const confirmErase = useCallback(async () => {
    if (!pendingEraseIds) return
    const ids = pendingEraseIds
    setPendingEraseIds(null)
    finishDeletedAction(await eraseIds(ids))
  }, [pendingEraseIds, eraseIds, finishDeletedAction])

  const deletedActions = useMemo(
    () =>
      isDeletedView
        ? {
            onRestore: handleRestore,
            onErase: () =>
              setPendingEraseIds(Array.from(selection.selectedIds)),
          }
        : undefined,
    [isDeletedView, handleRestore, selection.selectedIds],
  )

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
          deletedActions={deletedActions}
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
      deletedActions,
      canMove,
      tMove,
    ],
  )

  return (
    <div className={styles.listRoot}>
      <div className={`${styles.headingRow} ${styles.pageHeading}`}>
        <h1 className={pageTitleStyles.pageTitle}>{t("heading")}</h1>
        <MessagesViewTabs />
      </div>
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
        <RestoreEraseResultToast
          action='restore'
          result={restoreLastResult ?? flashFor("restore")}
          onDismiss={handleDismissRestore}
        />
        <RestoreEraseResultToast
          action='erase'
          result={eraseLastResult ?? flashFor("erase")}
          onDismiss={handleDismissErase}
        />
        <MoveResultToast
          result={activeMoveResult}
          onDismiss={handleDismissMoveResult}
        />
        {hasNoMessages ? (
          <Alert
            variant='info'
            title={emptyCopy.title}
            className={styles.emptyAlert}
            data-testid='messages-empty'
          >
            <Paragraph>{emptyCopy.description}</Paragraph>
          </Alert>
        ) : (
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
                deletedActions={deletedActions}
                onBulkMove={() => setMoveModalOpen(true)}
                canMove={canMove}
              />
            </div>
          </div>
        )}
        <DeleteConfirmationModal
          isOpen={pendingIds !== null}
          count={pendingIds?.length ?? 0}
          onClose={() => setPendingIds(null)}
          onConfirm={confirmDelete}
          isDeleting={isDeleting}
        />
        <DeleteConfirmationModal
          variant='erase'
          isOpen={pendingEraseIds !== null}
          count={pendingEraseIds?.length ?? 0}
          onClose={() => setPendingEraseIds(null)}
          onConfirm={confirmErase}
          isDeleting={isErasing}
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
      </Stack>
    </div>
  )
}
