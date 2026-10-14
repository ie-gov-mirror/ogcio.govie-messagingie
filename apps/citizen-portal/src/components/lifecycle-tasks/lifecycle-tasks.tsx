"use client"

import {
  Alert,
  Button,
  Heading,
  Paragraph,
  SectionBreak,
  Stack,
  toaster,
} from "@ogcio/design-system-react"
import { useAnalytics } from "@ogcio/nextjs-analytics"
import {
  SagFetchError,
  useGatewayDownload,
  useGatewayMutation,
} from "@ogcio/sag-client/react"
import { useTranslations } from "next-intl"
import { useCallback, useEffect, useState } from "react"
import { type LifecycleTask, profileApi } from "@/api/profile"
import { uploadApi } from "@/api/upload"
import { CssSpinner } from "@/components/css-spinner"
import { ANALYTICS } from "@/const/analytics"

interface SearchTasksResponse {
  tasks: LifecycleTask[]
}

const TaskStatuses = {
  Pending: "pending",
  Processing: "processing",
  Completed: "completed",
  Failed: "failed",
} as const

export function LifecycleTasks({
  profileId,
  locale,
}: {
  profileId: string
  locale: string
}) {
  const t = useTranslations("exportUserData")
  const analyticsClient = useAnalytics()
  const [requesting, setRequesting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [tasks, setTasks] = useState<LifecycleTask[]>([])

  const { trigger: searchTasks } = useGatewayMutation<SearchTasksResponse>(
    profileApi.lifecycleTasksSearchPath(),
    { method: "POST" },
  )

  const fetchTasks = useCallback(async () => {
    const result = await searchTasks({
      profileId,
      taskType: "export_user_data",
    })
    setTasks(result?.tasks ?? [])
  }, [searchTasks, profileId])

  useEffect(() => {
    fetchTasks().finally(() => setLoading(false))
  }, [fetchTasks])

  const { trigger: createExportTask } = useGatewayMutation<unknown>(
    profileApi.lifecycleTasksPath(),
    { method: "POST" },
  )

  const requestExport = useCallback(async () => {
    setRequesting(true)
    try {
      await createExportTask({ profileId, type: "export_user_data" })
      analyticsClient.trackEvent({
        event: {
          name: ANALYTICS.profile.exportRequested.name,
          category: ANALYTICS.profile.category,
          action: ANALYTICS.profile.exportRequested.action,
        },
      })
      toaster.create({
        title: t("toast.title.requestSuccess"),
        description: t("toast.description.requestSuccess"),
        position: { x: "right", y: "top" },
        variant: "success",
      })
      await fetchTasks()
    } catch {
      analyticsClient.trackEvent({
        event: {
          name: ANALYTICS.profile.exportRequestError.name,
          category: ANALYTICS.profile.category,
          action: ANALYTICS.profile.exportRequestError.action,
        },
      })
      toaster.create({
        title: t("toast.title.requestError"),
        description: t("toast.description.requestError"),
        position: { x: "right", y: "top" },
        variant: "danger",
      })
    } finally {
      setRequesting(false)
    }
  }, [createExportTask, profileId, fetchTasks, t, analyticsClient])

  if (loading) {
    return (
      <output aria-label='Loading export data' className='gi-py-4'>
        <CssSpinner size='md' />
      </output>
    )
  }

  const exportTask = tasks.length > 0 ? tasks[0] : undefined

  let taskStatus = exportTask?.status
  const expireAt = exportTask?.metadata?.expiresAt
    ? new Date(exportTask.metadata.expiresAt)
    : undefined
  let taskFileId: string | undefined
  if (exportTask && exportTask.status === TaskStatuses.Completed) {
    taskFileId = exportTask.metadata?.uploadId
    if (!taskFileId) {
      taskStatus = TaskStatuses.Failed
    }
  }

  const now = new Date()

  const expirationStats = {
    validFile: taskFileId && expireAt && expireAt > now,
    expiredFile: taskFileId && expireAt && expireAt <= now,
    labelExpirationDate: expireAt
      ? expireAt.toLocaleDateString(locale, {
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : "",
    stillValidForDays: expireAt
      ? Math.ceil((expireAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      : undefined,
  }

  const isFailed = taskStatus === TaskStatuses.Failed
  const showRequestButton =
    taskStatus === undefined ||
    (taskStatus === TaskStatuses.Completed && expirationStats.expiredFile) ||
    taskStatus === TaskStatuses.Failed
  const showDownloadButton =
    taskStatus === TaskStatuses.Completed && expirationStats.validFile
  const isPending =
    taskStatus === TaskStatuses.Pending ||
    taskStatus === TaskStatuses.Processing

  const downloadPath = taskFileId ? uploadApi.filePath(taskFileId) : undefined

  return (
    <>
      <div style={{ width: "100%" }}>
        <SectionBreak />
      </div>
      <Heading as='h2' size='sm'>
        {t("title")}
      </Heading>
      <Paragraph>{t("paragraph.main")}</Paragraph>

      {showDownloadButton && (
        <Alert title={t("alert.success.title")} variant='success'>
          <Paragraph>
            {t("alert.success.paragraph1", {
              date: expirationStats.labelExpirationDate,
            })}
          </Paragraph>
          <Paragraph>
            ({expirationStats.stillValidForDays} {t("alert.success.paragraph2")}
            )
          </Paragraph>
        </Alert>
      )}

      {isPending && (
        <Alert title={t("alert.info.title")}>
          <Paragraph>{t("alert.info.paragraph")}</Paragraph>
        </Alert>
      )}

      {isFailed && (
        <Alert title={t("alert.failed.title")}>
          <Paragraph>{t("alert.failed.paragraph")}</Paragraph>
        </Alert>
      )}

      <Stack direction='column' gap={4}>
        {showDownloadButton && downloadPath && (
          <DownloadButton
            downloadPath={downloadPath}
            label={t("button.download")}
          />
        )}
        {showRequestButton && (
          <Button onClick={() => void requestExport()} disabled={requesting}>
            {requesting ? <CssSpinner size='sm' /> : t("button.request")}
          </Button>
        )}
        {isPending && <Paragraph>{t("paragraph.pending")}</Paragraph>}
        {(showDownloadButton || isPending) &&
          expirationStats.stillValidForDays != null &&
          expirationStats.stillValidForDays > 0 && (
            <Paragraph>
              {t("paragraph.cooldown", {
                days: expirationStats.stillValidForDays,
              })}
            </Paragraph>
          )}
      </Stack>
    </>
  )
}

function DownloadButton({
  downloadPath,
  label,
}: {
  downloadPath: string
  label: string
}) {
  const t = useTranslations("exportUserData")
  const analyticsClient = useAnalytics()
  const { download, isDownloading } = useGatewayDownload()

  const handleDownload = async () => {
    try {
      await download(downloadPath, "export.zip")
      analyticsClient.trackEvent({
        event: {
          name: ANALYTICS.profile.exportDownloaded.name,
          category: ANALYTICS.profile.category,
          action: ANALYTICS.profile.exportDownloaded.action,
        },
      })
    } catch (err) {
      const isServerError = err instanceof SagFetchError && err.status >= 500
      toaster.create({
        title: t(
          isServerError
            ? "toast.title.serverError"
            : "toast.title.errorUnableToStart",
        ),
        description: t(
          isServerError
            ? "toast.description.serverError"
            : "toast.description.errorUnableToStart",
        ),
        position: { x: "right", y: "top" },
        variant: "danger",
      })
    }
  }

  return (
    <Button onClick={() => void handleDownload()} disabled={isDownloading}>
      {isDownloading ? <CssSpinner size='sm' /> : label}
    </Button>
  )
}
