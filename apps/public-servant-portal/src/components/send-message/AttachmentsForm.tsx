import {
  Button,
  Heading,
  InputFile,
  Paragraph,
  Stack,
  toaster,
} from "@ogcio/design-system-react"
import { useAnalytics } from "@ogcio/nextjs-analytics"
import { useTable } from "@tanstack/react-table"
import { useTranslations } from "next-intl"
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { BackButton } from "@/components/BackButton"
import { DeleteIcon } from "@/components/icons/delete"
import { TanStackTable } from "@/components/tables/TanStackTable"
import { type Column, features } from "@/components/tables/table-features"
import { ANALYTICS } from "@/const/analytics"
import { defaultFormGap } from "@/util/datetime"
import { SendMessageContext } from "./SendMessageContext"

type AttachmentEntry = {
  id: string
  fileName: string
  fileSize: number
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(0)}MB`
}

const MAX_ATTACHMENT_SIZE_MB = 5
const MAX_ATTACHMENT_SIZE_BYTES = MAX_ATTACHMENT_SIZE_MB * 1024 * 1024
const MAX_ATTACHMENT_COUNT = 3
const ALLOWED_FORMATS = ".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"

// Row ids only need to be unique on the page. crypto.randomUUID exists only in
// secure contexts (https, localhost), so a plain-http host would throw.
let lastAttachmentId = 0
const newAttachmentId = () => `attachment-${++lastAttachmentId}`

export default function AttachmentsForm() {
  const t = useTranslations("message.wizard.step.attachments")
  const { message, onStep, canUploadFiles, pendingFiles, setPendingFiles } =
    useContext(SendMessageContext)
  const [attachments, setAttachments] = useState<AttachmentEntry[]>(
    () =>
      pendingFiles.map((f) => ({
        id: newAttachmentId(),
        fileName: f.name,
        fileSize: f.size,
      })) ?? [],
  )
  const inputFileRef = useRef<HTMLInputElement>(null)
  const analyticsClient = useAnalytics()

  useEffect(() => {
    analyticsClient.trackEvent({
      event: {
        name: ANALYTICS.message.stepAttachments.name,
        category: ANALYTICS.message.category,
        action: ANALYTICS.message.stepAttachments.action,
      },
    })
  }, [])

  const handleFileChange = async (
    e: React.ChangeEvent<Pick<HTMLInputElement, "files" | "value">>,
  ) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (attachments.length >= MAX_ATTACHMENT_COUNT) {
      toaster.create({
        title: t("toast.error.maxCount"),
        position: { x: "right", y: "top" },
        variant: "danger",
      })
      if (inputFileRef.current) inputFileRef.current.value = ""
      return
    }

    if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
      toaster.create({
        title: t("toast.error.maxSize"),
        position: { x: "right", y: "top" },
        variant: "danger",
      })
      if (inputFileRef.current) inputFileRef.current.value = ""
      return
    }

    const id = newAttachmentId()
    setPendingFiles((prev) => [...prev, file])
    setAttachments((prev) => [
      ...prev,
      {
        id,
        fileName: file.name,
        fileSize: file.size,
      },
    ])
    if (inputFileRef.current) inputFileRef.current.value = ""
  }

  const handleRemove = useCallback(
    (id: string) => {
      const idx = attachments.findIndex((a) => a.id === id)
      if (idx !== -1) {
        setPendingFiles((prev) => prev.filter((_, i) => i !== idx))
        setAttachments((prev) => prev.filter((a) => a.id !== id))
      }
    },
    [attachments, setPendingFiles],
  )

  const handleNext = () => {
    onStep(
      {
        ...message,
        attachments: attachments.map(({ fileName, fileSize }) => ({
          fileName,
          fileSize,
        })),
      },
      "next",
    )
  }

  const handleSkip = () => {
    setPendingFiles([])
    onStep({ ...message, attachments: [] }, "next")
  }

  const columns = useMemo<Column<AttachmentEntry>[]>(
    () => [
      {
        id: "fileName",
        header: t("table.header.fileName"),
        meta: { size: "fluid" },
        accessorKey: "fileName",
      },
      {
        id: "fileSize",
        header: t("table.header.fileSize"),
        meta: { size: "sm-fixed" },
        accessorFn: (row) => formatFileSize(row.fileSize),
      },
      {
        id: "actions",
        header: t("table.header.actions"),
        meta: { size: "sm-fixed" },
        cell: ({ row }) => (
          <Button
            variant='flat'
            ariaLabel={t("button.arialabel.remove")}
            onClick={() => handleRemove(row.original.id)}
          >
            <DeleteIcon size='sm' />
          </Button>
        ),
      },
    ],
    [handleRemove, t],
  )

  const table = useTable({
    features,
    data: attachments,
    columns,
  })

  return (
    <Stack direction='column' gap={defaultFormGap}>
      <Heading>{t("heading.main")}</Heading>
      <Paragraph>{t("paragraph.main")}</Paragraph>

      <Stack direction='column' gap={4}>
        <Heading as='h3'>{t("heading.upload")}</Heading>
        <Paragraph>
          {t("paragraph.maxSize", {
            count: MAX_ATTACHMENT_COUNT,
            size: MAX_ATTACHMENT_SIZE_MB,
          })}
        </Paragraph>

        <InputFile
          ref={inputFileRef}
          accept={ALLOWED_FORMATS}
          multiple={false}
          onChange={(e) => {
            if (!canUploadFiles) {
              toaster.create({
                title: t("paragraph.permission"),
                position: { x: "right", y: "top" },
                variant: "danger",
              })
              if (inputFileRef.current) inputFileRef.current.value = ""
              return
            }
            handleFileChange(e)
          }}
          id='attachment-file-input'
        />
      </Stack>

      {attachments.length > 0 && (
        <TanStackTable table={table} aria-label={t("heading.upload")} />
      )}

      <Stack direction='row' gap={defaultFormGap}>
        <Button variant='secondary' onClick={handleSkip}>
          {t("button.skip")}
        </Button>
        <Button onClick={handleNext}>{t("button.next")}</Button>
      </Stack>

      <BackButton onClick={() => onStep(message, "previous")}>
        {t("button.back")}
      </BackButton>
    </Stack>
  )
}
