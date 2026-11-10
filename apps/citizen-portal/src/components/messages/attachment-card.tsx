"use client"

import { faro, LogLevel } from "@grafana/faro-web-sdk"
import {
  Card,
  CardContainer,
  CardHeader,
  CardSubtitle,
  CardTitle,
  Icon,
  type IconProps,
  Link,
} from "@ogcio/design-system-react"
import { useAuth, useGatewayFetch } from "@ogcio/sag-client/react"
import { useTranslations } from "next-intl"
import { type MouseEvent, useEffect, useRef } from "react"
import { type FileMetadata, uploadApi } from "@/api/upload"
import { ANALYTICS } from "@/const/analytics"
import { TRACE_MESSAGES } from "@/const/traces"
import { useTrack } from "@/hooks/use-track"
import styles from "./attachment-card.module.css"

/**
 * Maps a file's MIME type (with a filename-extension fallback) to a Material
 * Symbol name. Interim coverage (PDF, Word, image, spreadsheet, generic) until
 * the DS ships dedicated file-type icons, at which point this can be removed.
 */
function getFileTypeIcon(
  mimeType: string | undefined,
  fileName: string,
): IconProps["icon"] {
  const mime = (mimeType ?? "").toLowerCase()
  const extension = getExtension(fileName)

  if (mime === "application/pdf" || extension === "pdf") {
    return "picture_as_pdf" as IconProps["icon"]
  }
  if (
    mime.startsWith("image/") ||
    ["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(extension)
  ) {
    return "image" as IconProps["icon"]
  }
  if (
    mime.includes("word") ||
    mime.includes("opendocument.text") ||
    ["doc", "docx", "odt", "rtf"].includes(extension)
  ) {
    return "description" as IconProps["icon"]
  }
  if (
    mime.includes("spreadsheet") ||
    mime.includes("excel") ||
    ["xls", "xlsx", "csv", "ods"].includes(extension)
  ) {
    return "table_chart" as IconProps["icon"]
  }
  return "draft" as IconProps["icon"]
}

function getExtension(fileName: string): string {
  return fileName.includes(".")
    ? (fileName.split(".").pop()?.toLowerCase() ?? "")
    : ""
}

function getFileTypeLabel(fileName: string): string {
  return getExtension(fileName).toUpperCase() || "FILE"
}

export function AttachmentCard({ id }: { id: string }) {
  const t = useTranslations("home.detail.attachment")
  const track = useTrack()

  const { authenticated, loading, signIn } = useAuth()

  const { data, error, isLoading } = useGatewayFetch<FileMetadata>(
    uploadApi.metadataKey(id),
  )

  const reauthIfLoggedOut = (e: MouseEvent<HTMLElement>) => {
    if (!loading && !authenticated) {
      e.preventDefault()
      signIn({ redirectUrl: window.location.href })
    }
  }

  // Guard so a single real failure is reported once, even if the fetch
  // state churns between renders.
  const reportedMissing = useRef(false)
  useEffect(() => {
    if (isLoading || data || reportedMissing.current) return
    reportedMissing.current = true
    faro.api.pushLog([TRACE_MESSAGES.ATTACHMENT_METADATA.MISSING], {
      context: {
        attachmentId: id,
        error: error instanceof Error ? error.message : String(error ?? "none"),
      },
      level: LogLevel.WARN,
    })
    track.event(ANALYTICS.message.attachmentError)
  }, [data, error, id, isLoading, track])

  if (!data) return null

  const sizeKb = Math.round(data.fileSize / 1024)
  // Same-origin nginx proxy that injects the X-Application header a bare link
  // can't send. Both actions point here: Download forces a save (download attr),
  // Open previews inline in a new tab (the gateway serves files inline).
  const fileUrl = `/_next/files${uploadApi.filePath(id)}`
  const fileTypeIcon = getFileTypeIcon(data.mimeType, data.fileName)

  return (
    <Card
      type='vertical'
      background='grey'
      inset='full'
      className={styles.card}
    >
      <CardContainer>
        <CardHeader>
          <CardTitle>
            <span className={styles.titleRow}>
              <Icon
                icon={fileTypeIcon}
                size='lg'
                className={styles.fileTypeIcon}
                ariaHidden
              />
              <span className={styles.fileName}>{data.fileName}</span>
            </span>
          </CardTitle>
          <CardSubtitle>{`${getFileTypeLabel(data.fileName)} - ${sizeKb} KB`}</CardSubtitle>
          <span className={styles.actions}>
            <Link
              dataTestid='attachment-download-action'
              href={fileUrl}
              download={data.fileName}
              iconStart='download'
              aria-label={t("downloadFile", { fileName: data.fileName })}
              onClick={(e) => {
                track.event(ANALYTICS.message.attachmentDownload)
                reauthIfLoggedOut(e)
              }}
            >
              {t("download")}
            </Link>
            <Link
              dataTestid='attachment-preview-action'
              href={fileUrl}
              target='_blank'
              rel='noopener noreferrer'
              iconStart='open_in_new'
              aria-label={t("openFile", { fileName: data.fileName })}
              onClick={(e) => {
                track.event(ANALYTICS.message.attachmentOpen)
                reauthIfLoggedOut(e)
              }}
            >
              {t("open")}
            </Link>
          </span>
        </CardHeader>
      </CardContainer>
    </Card>
  )
}
