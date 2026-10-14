"use client"

import { Button, Icon, SideNav, SideNavItem } from "@ogcio/design-system-react"
import { usePathname, useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useCallback, useEffect, useRef, useState } from "react"
import { mutate as swrMutate } from "swr"
import { DELETED_FOLDER_ID, INBOX_FOLDER_ID, messagesApi } from "@/api/messages"
import { useUrlSearchParams } from "@/hooks/use-url-search-params"
import type { Folder } from "@/types/folder"
import { DeleteFolderModal } from "./delete-folder-modal"
import { FolderFormModal, type FolderSaveOutcome } from "./folder-form-modal"
import { showFolderToast } from "./folder-toast"
import { InboxUnreadBadge } from "./inbox-unread-badge"
import styles from "./message-folders-sidebar.module.css"
import { useCreateFolder } from "./use-create-folder"
import { useDeleteFolder } from "./use-delete-folder"
import { useFolders } from "./use-folders"
import { useInboxUnreadCount } from "./use-inbox-unread-count"
import { useRenameFolder } from "./use-rename-folder"

/**
 * Invalidate every cached messages listing so restored/moved messages show up
 * without waiting on SWR's focus/reconnect heuristics. Mirrors the matcher in
 * `use-mark-message-as-read.ts`.
 */
function invalidateMessageListings() {
  void swrMutate((key: unknown) => messagesApi.isListKey(key))
}

type FormState = { type: "create" } | { type: "rename"; folder: Folder } | null

export function MessageFoldersSidebar() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useUrlSearchParams()
  const t = useTranslations("home.folders")
  const tMove = useTranslations("home.move.modal")

  const selectedFolderId = searchParams.get("folder") ?? INBOX_FOLDER_ID
  const { count: unreadCount, isLoading: isUnreadLoading } =
    useInboxUnreadCount()

  const { folders, refresh: refreshFolders } = useFolders()
  const { createFolder } = useCreateFolder()
  const { renameFolder } = useRenameFolder()
  const { deleteFolder, isLoading: isDeleting } = useDeleteFolder()

  const [formState, setFormState] = useState<FormState>(null)
  const [deleteTarget, setDeleteTarget] = useState<Folder | null>(null)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)

  const navigateToFolder = useCallback(
    (folderId: string) => {
      const params = new URLSearchParams(searchParams)
      params.delete("id")
      params.delete("page")

      if (folderId === INBOX_FOLDER_ID) {
        params.delete("folder")
      } else {
        params.set("folder", folderId)
      }

      const qs = params.toString()
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [pathname, router, searchParams],
  )

  const handleCreateSubmit = useCallback(
    (name: string): Promise<FolderSaveOutcome> => createFolder(name),
    [createFolder],
  )

  const handleCreateSuccess = useCallback(() => {
    setFormState(null)
    refreshFolders()
    showFolderToast(t("toast.created"), { testId: "folder-created-toast" })
  }, [refreshFolders, t])

  const handleRenameSubmit = useCallback(
    (name: string): Promise<FolderSaveOutcome> => {
      if (formState?.type !== "rename") return Promise.resolve({ ok: false })
      return renameFolder(formState.folder.id, name)
    },
    [formState, renameFolder],
  )

  const handleRenameSuccess = useCallback(() => {
    setFormState(null)
    refreshFolders()
    showFolderToast(t("toast.renamed"), { testId: "folder-renamed-toast" })
  }, [refreshFolders, t])

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return
    const target = deleteTarget
    const result = await deleteFolder(target.id)
    if (!result.ok) {
      setDeleteTarget(null)
      showFolderToast(t("toast.deleteFailed"), {
        variant: "danger",
        testId: "folder-delete-failure-toast",
      })
      return
    }
    setDeleteTarget(null)
    refreshFolders()
    invalidateMessageListings()
    if (selectedFolderId === target.id) {
      navigateToFolder(INBOX_FOLDER_ID)
    }
    showFolderToast(t("toast.deleted"), { testId: "folder-deleted-toast" })
  }, [
    deleteTarget,
    deleteFolder,
    refreshFolders,
    selectedFolderId,
    navigateToFolder,
    t,
  ])

  const inboxLabel = (
    <span className={styles.inboxLabel}>
      <span aria-hidden>{tMove("inbox")}</span>
      <InboxUnreadBadge />
      <span className={styles.srOnly}>
        {isUnreadLoading
          ? tMove("inbox")
          : unreadCount > 0
            ? `${tMove("inbox")}, ${t("unreadBadge", { count: unreadCount })}`
            : tMove("inbox")}
      </span>
    </span>
  )

  return (
    <nav className={styles.sidebarNav} aria-label={t("sidebarAriaLabel")}>
      <SideNav
        key={selectedFolderId}
        value={selectedFolderId}
        onChange={navigateToFolder}
      >
        <SideNavItem value={INBOX_FOLDER_ID} label={inboxLabel} />

        {folders.map((folder) => (
          <SideNavItem
            key={folder.id}
            value={folder.id}
            label={folder.label}
            actions={
              <FolderOptionsMenu
                folder={folder}
                isOpen={openMenuId === folder.id}
                onToggle={() =>
                  setOpenMenuId((prev) =>
                    prev === folder.id ? null : folder.id,
                  )
                }
                onClose={() => setOpenMenuId(null)}
                onRename={() => {
                  setOpenMenuId(null)
                  setFormState({ type: "rename", folder })
                }}
                onDelete={() => {
                  setOpenMenuId(null)
                  setDeleteTarget(folder)
                }}
              />
            }
          />
        ))}

        <SideNavItem value={DELETED_FOLDER_ID} label={t("deleted")} />
      </SideNav>

      <Button
        variant='primary'
        className={styles.createFolderButton}
        type='button'
        data-testid='create-folder-button'
        onClick={() => setFormState({ type: "create" })}
      >
        {t("createFolder")}
      </Button>

      <FolderFormModal
        isOpen={formState?.type === "create"}
        mode='create'
        onClose={() => setFormState(null)}
        onSubmit={handleCreateSubmit}
        onSuccess={handleCreateSuccess}
      />

      <FolderFormModal
        isOpen={formState?.type === "rename"}
        mode='rename'
        initialValue={
          formState?.type === "rename" ? formState.folder.label : ""
        }
        onClose={() => setFormState(null)}
        onSubmit={handleRenameSubmit}
        onSuccess={handleRenameSuccess}
      />

      <DeleteFolderModal
        isOpen={deleteTarget !== null}
        folderName={deleteTarget?.label ?? ""}
        isDeleting={isDeleting}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
      />
    </nav>
  )
}

interface FolderOptionsMenuProps {
  folder: Folder
  isOpen: boolean
  onToggle: () => void
  onClose: () => void
  onRename: () => void
  onDelete: () => void
}

function FolderOptionsMenu({
  folder,
  isOpen,
  onToggle,
  onClose,
  onRename,
  onDelete,
}: FolderOptionsMenuProps) {
  const t = useTranslations("home.folders")
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        onClose()
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }

    document.addEventListener("mousedown", handlePointerDown)
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("mousedown", handlePointerDown)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [isOpen, onClose])

  return (
    <div className={styles.menuContainer} ref={containerRef}>
      <button
        type='button'
        className={styles.folderMenuButton}
        aria-label={t("folderOptions", { folder: folder.label })}
        aria-haspopup='menu'
        aria-expanded={isOpen}
        data-testid={`folder-options-${folder.id}`}
        onClick={onToggle}
      >
        <Icon icon='more_vert' size='md' ariaHidden />
      </button>
      {isOpen ? (
        <div className={styles.menuPopover} role='menu'>
          <button
            type='button'
            role='menuitem'
            className={styles.menuItem}
            data-testid={`folder-rename-${folder.id}`}
            onClick={onRename}
          >
            <Icon icon='edit' size='sm' ariaHidden />
            <span>{t("rename")}</span>
          </button>
          <button
            type='button'
            role='menuitem'
            className={styles.menuItem}
            data-testid={`folder-delete-${folder.id}`}
            onClick={onDelete}
          >
            <Icon icon='delete' size='sm' ariaHidden />
            <span>{t("deleteFolder")}</span>
          </button>
        </div>
      ) : null}
    </div>
  )
}
