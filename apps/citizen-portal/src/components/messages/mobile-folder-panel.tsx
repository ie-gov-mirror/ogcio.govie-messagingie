"use client"

import { Button, Icon, InputText } from "@ogcio/design-system-react"
import { usePathname, useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useCallback, useEffect, useRef, useState } from "react"
import { DELETED_FOLDER_ID, INBOX_FOLDER_ID } from "@/api/messages"
import { useUrlSearchParams } from "@/hooks/use-url-search-params"
import { FOLDER_NAME_MAX_LENGTH } from "./folder-form-modal"
import { InboxUnreadBadge } from "./inbox-unread-badge"
import styles from "./mobile-panel.module.css"
import { useCreateFolder } from "./use-create-folder"
import { useFolders } from "./use-folders"

export interface MobileFolderPanelProps {
  isOpen: boolean
  onClose: () => void
}

/** In-panel toast auto-dismiss duration (ms), per the design spec. */
const PANEL_TOAST_DURATION = 4_000

/**
 * Mobile-only left slide-in panel for folder navigation + creation. The
 * desktop folder sidebar is hidden below the layout breakpoint, so this panel
 * is the only way to switch folders or create one on small screens. `Close`
 * is the sole exit (selecting a folder also closes it by navigating).
 */
export function MobileFolderPanel({ isOpen, onClose }: MobileFolderPanelProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useUrlSearchParams()
  const t = useTranslations("home.folders")
  const tMove = useTranslations("home.move.modal")

  const selectedFolderId = searchParams.get("folder") ?? INBOX_FOLDER_ID
  const { folders, refresh: refreshFolders } = useFolders()
  const { createFolder, isLoading: isCreating } = useCreateFolder()

  const [showForm, setShowForm] = useState(false)
  const [value, setValue] = useState("")
  const [error, setError] = useState<"duplicate" | "generic" | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // Reset transient form/toast state whenever the panel is (re)opened.
  useEffect(() => {
    if (!isOpen) {
      setShowForm(false)
      setValue("")
      setError(null)
    }
  }, [isOpen])

  // Keep the panel inside the *visual* viewport so the bottom-anchored create
  // form (input + Save/Cancel) stays above the on-screen keyboard. The panel is
  // a fixed, full-height overlay, so without this the focused field would sit
  // behind the keyboard with no scroll room to lift it into view.
  useEffect(() => {
    if (!isOpen) return
    const viewport = window.visualViewport
    const panel = panelRef.current
    if (!viewport || !panel) return

    const syncHeight = () => {
      panel.style.height = `${viewport.height}px`
    }
    syncHeight()
    viewport.addEventListener("resize", syncHeight)
    viewport.addEventListener("scroll", syncHeight)
    return () => {
      viewport.removeEventListener("resize", syncHeight)
      viewport.removeEventListener("scroll", syncHeight)
      panel.style.height = ""
    }
  }, [isOpen])

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current)
    }
  }, [])

  const showToast = useCallback((message: string) => {
    setToastMessage(message)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(
      () => setToastMessage(null),
      PANEL_TOAST_DURATION,
    )
  }, [])

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
      onClose()
    },
    [pathname, router, searchParams, onClose],
  )

  const trimmed = value.trim()

  const handleSave = useCallback(async () => {
    if (!trimmed || isCreating) return
    setError(null)
    const outcome = await createFolder(trimmed)
    if (outcome.ok) {
      setShowForm(false)
      setValue("")
      refreshFolders()
      showToast(t("toast.created"))
    } else {
      setError(outcome.conflict ? "duplicate" : "generic")
    }
  }, [trimmed, isCreating, createFolder, refreshFolders, showToast, t])

  if (!isOpen) return null

  return (
    <div className={styles.overlay} data-testid='mobile-folder-panel'>
      <button
        type='button'
        className={styles.backdrop}
        aria-hidden
        tabIndex={-1}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        className={styles.panel}
        role='dialog'
        aria-label={t("panel.title")}
      >
        <div className={styles.header}>
          <span className={styles.title}>{t("panel.title")}</span>
          <Button
            variant='flat'
            appearance='default'
            size='small'
            data-testid='mobile-folder-panel-close'
            onClick={onClose}
          >
            <span className='gi-inline-flex gi-items-center gi-gap-1'>
              {t("panel.close")}
              <Icon icon='close' size='sm' />
            </span>
          </Button>
        </div>

        {toastMessage ? (
          <div
            className={styles.toast}
            role='status'
            data-testid='mobile-folder-toast'
          >
            {toastMessage}
          </div>
        ) : null}

        <ul className={styles.folderList}>
          <li>
            <button
              type='button'
              className={folderItemClass(selectedFolderId === INBOX_FOLDER_ID)}
              onClick={() => navigateToFolder(INBOX_FOLDER_ID)}
            >
              <span className={styles.folderLabel}>{tMove("inbox")}</span>
              <InboxUnreadBadge />
            </button>
          </li>
          {folders.map((folder) => (
            <li key={folder.id}>
              <button
                type='button'
                className={folderItemClass(selectedFolderId === folder.id)}
                data-testid={`mobile-folder-${folder.id}`}
                onClick={() => navigateToFolder(folder.id)}
              >
                <span className={styles.folderLabel}>{folder.label}</span>
              </button>
            </li>
          ))}
          <li>
            <button
              type='button'
              className={folderItemClass(
                selectedFolderId === DELETED_FOLDER_ID,
              )}
              onClick={() => navigateToFolder(DELETED_FOLDER_ID)}
            >
              <span className={styles.folderLabel}>{t("deleted")}</span>
            </button>
          </li>
        </ul>

        <div className={styles.footer}>
          {showForm ? (
            <div className={styles.createForm}>
              <InputText
                id='mobile-folder-name-input'
                data-testid='mobile-folder-name-input'
                type='text'
                value={value}
                maxLength={FOLDER_NAME_MAX_LENGTH}
                placeholder={t("placeholder")}
                disabled={isCreating}
                aria-invalid={error !== null}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  setValue(e.target.value)
                  if (error) setError(null)
                }}
                onKeyDown={(e: React.KeyboardEvent) => {
                  if (e.key === "Enter") void handleSave()
                }}
              />
              {error ? (
                <p
                  className={styles.errorText}
                  data-testid='mobile-folder-error'
                >
                  {error === "duplicate"
                    ? t("error.duplicate")
                    : t("error.generic")}
                </p>
              ) : null}
              <div className={styles.formActions}>
                <Button
                  variant='secondary'
                  appearance='default'
                  disabled={isCreating}
                  data-testid='mobile-folder-cancel'
                  onClick={() => {
                    setShowForm(false)
                    setValue("")
                    setError(null)
                  }}
                >
                  {t("cancel")}
                </Button>
                <Button
                  variant='primary'
                  appearance='default'
                  disabled={!trimmed || isCreating}
                  ariaBusy={isCreating}
                  data-testid='mobile-folder-save'
                  onClick={() => void handleSave()}
                >
                  {t("save")}
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant='primary'
              className={styles.createButton}
              data-testid='mobile-create-folder-button'
              onClick={() => setShowForm(true)}
            >
              {t("createFolder")}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

function folderItemClass(isSelected: boolean): string {
  return isSelected
    ? `${styles.folderItem} ${styles.folderItemSelected}`
    : styles.folderItem
}
