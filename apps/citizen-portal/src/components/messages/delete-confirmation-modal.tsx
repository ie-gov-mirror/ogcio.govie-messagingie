"use client"

import {
  Button,
  ModalBody,
  ModalFooter,
  ModalTitle,
  ModalWrapper,
  Paragraph,
} from "@ogcio/design-system-react"
import { useTranslations } from "next-intl"

export interface DeleteConfirmationModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  count: number
  isDeleting?: boolean
  /**
   * `erase` is the permanent deletion from the Deleted folder: same shape,
   * its own `home.erase.confirm` copy, and its own test ids.
   */
  variant?: "delete" | "erase"
}

/**
 * Single confirmation modal used for both individual (count = 1) and bulk
 * delete. Copy pluralises via `home.delete.confirm.body`. RFC Open Q2
 * resolution: always ask before soft-deleting. The `erase` variant asks before
 * deleting from the Deleted folder for good.
 */
export function DeleteConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  count,
  isDeleting = false,
  variant = "delete",
}: DeleteConfirmationModalProps) {
  const tDelete = useTranslations("home.delete.confirm")
  const tErase = useTranslations("home.erase.confirm")
  const t = variant === "erase" ? tErase : tDelete

  return (
    <ModalWrapper
      isOpen={isOpen}
      onClose={onClose}
      position='center'
      closeOnOverlayClick={!isDeleting}
      closeOnEscape={!isDeleting}
      closeButtonLabel={t("close")}
      dataTestId={`${variant}-confirmation-modal`}
    >
      <ModalTitle>{t("title", { count })}</ModalTitle>
      <ModalBody>
        <Paragraph>{t("body", { count })}</Paragraph>
      </ModalBody>
      <ModalFooter orientation='horizontal'>
        <Button
          variant='secondary'
          appearance='default'
          onClick={onClose}
          disabled={isDeleting}
          data-testid={`${variant}-confirmation-cancel`}
        >
          {t("cancel")}
        </Button>
        <Button
          variant='primary'
          appearance='default'
          onClick={onConfirm}
          disabled={isDeleting}
          ariaBusy={isDeleting}
          data-testid={`${variant}-confirmation-confirm`}
        >
          {t("cta")}
        </Button>
      </ModalFooter>
    </ModalWrapper>
  )
}
