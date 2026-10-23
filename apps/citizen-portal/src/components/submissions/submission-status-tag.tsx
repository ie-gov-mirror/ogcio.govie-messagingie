"use client"

import { Tag, type TagType, TagTypeEnum } from "@ogcio/design-system-react"
import { useTranslations } from "next-intl"
import type { SubmissionStatus } from "@/types"

function tagTypeForStatus(status: SubmissionStatus): TagType {
  switch (status) {
    case "initiated":
      return TagTypeEnum.Warning
    case "submitted":
      return TagTypeEnum.Info
    case "processing":
      return TagTypeEnum.Info
    case "completed":
      return TagTypeEnum.Success
    case "cancelled":
      return TagTypeEnum.Error
    default: {
      const _exhaustive: never = status
      return _exhaustive
    }
  }
}

export function SubmissionStatusTag({ status }: { status: SubmissionStatus }) {
  const t = useTranslations("submissions.status")
  return <Tag text={t(status)} type={tagTypeForStatus(status)} />
}
