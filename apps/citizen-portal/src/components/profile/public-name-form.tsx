"use client"

import {
  FormField,
  FormFieldError,
  Heading,
  Paragraph,
  Stack,
  TextInput,
  toaster,
} from "@ogcio/design-system-react"
import { useGatewayMutation } from "@ogcio/sag-client/react"
import { useTranslations } from "next-intl"
import { type FormEvent, useCallback, useState } from "react"
import { FullWidthContainer } from "@/components/layout/containers"

export function PublicNameForm({
  publicName,
  profileId,
  onUpdated,
}: {
  publicName: string
  profileId: string
  onUpdated: () => void
}) {
  const t = useTranslations("profile")
  const [value, setValue] = useState(publicName)
  const [validationError, setValidationError] = useState<string | undefined>()
  const { trigger, isLoading } = useGatewayMutation<
    unknown,
    { publicName: string }
  >(`/profile/api/v1/profiles/${profileId}`, { method: "PATCH" })

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault()
      const trimmed = value.trim()

      if (!trimmed) {
        setValidationError(t("emptyPublicName"))
        return
      }

      setValidationError(undefined)

      try {
        await trigger({ publicName: trimmed })

        toaster.create({
          title: t("publicNameUpdatedToast"),
          position: { x: "right", y: "top" },
          variant: "success",
        })
        onUpdated()
      } catch {
        toaster.create({
          title: t("publicNameFailedUpdatedToast"),
          position: { x: "right", y: "top" },
          variant: "danger",
        })
      }
    },
    [value, t, onUpdated, trigger],
  )

  return (
    <FullWidthContainer>
      <form onSubmit={handleSubmit} data-testid='public-name-form'>
        <Stack direction='column' gap={6}>
          <Heading
            as='h2'
            size='md'
            id='public-name-heading'
            data-testid='public-name-heading'
          >
            {t("form.title")}
          </Heading>
          <FormField>
            <Paragraph id='public-name-helper' data-testid='public-name-helper'>
              {t("form.description")}
            </Paragraph>
            {validationError && <FormFieldError text={validationError} />}
            <TextInput
              id='publicName'
              name='publicName'
              aria-labelledby='public-name-heading'
              aria-describedby='public-name-helper'
              value={value}
              onChange={(e) => setValue(e.target.value)}
              data-testid='public-name-input'
            />
          </FormField>
          <div>
            <button
              type='submit'
              className='gi-btn gi-btn-primary gi-btn-regular'
              disabled={isLoading}
              data-testid='public-name-submit'
            >
              {t("update")}
            </button>
          </div>
        </Stack>
      </form>
    </FullWidthContainer>
  )
}
