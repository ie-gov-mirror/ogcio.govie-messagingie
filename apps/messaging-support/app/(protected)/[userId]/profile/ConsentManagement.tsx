"use client"

import {
  Alert,
  Button,
  FormField,
  FormFieldLabel,
  Heading,
  Modal,
  ModalBody,
  ModalFooter,
  ModalTitle,
  SelectItemNext,
  SelectNext,
  Spinner,
  Stack,
  SummaryList,
  SummaryListAction,
  SummaryListHeader,
  SummaryListRow,
  SummaryListValue,
  toaster,
} from "@ogcio/design-system-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import type { Consent, GetUserConsentDataResponse } from "@/data/types"
import { updateProfileConsentDataAction } from "@/utils/actions"
import { ConsentStatusTag } from "./ConsentStatusTag"
export function ConsentManagement(props: {
  consentData: GetUserConsentDataResponse
  profileId: string
}) {
  const { consentData, profileId } = props
  const router = useRouter()

  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<Error | null>(null)
  const [selectedStatus, setSelectedStatus] = useState<Consent["status"]>()

  async function handleConsentUpdate(
    subject: string,
    status: Consent["status"],
  ) {
    setLoading(true)
    const response = await updateProfileConsentDataAction({
      profileId,
      consents: [{ subject, status }],
    })

    setLoading(false)

    if (!response.success) {
      setError(response.error)
      return
    }

    setError(null)
    router.refresh()
    toaster.create({
      title: "Success!",
      description: `Consent updated for ${subject}`,
    })
  }

  return (
    <Stack direction='column' gap={3}>
      <Heading as='h4'>Consent Management</Heading>
      {consentData.success ? (
        <SummaryList withBorder>
          <SummaryListHeader label='Available consent data' />
          {consentData.value.consents.map((consent) => (
            <SummaryListRow withBorder key={consent.id} label={consent.subject}>
              <SummaryListValue>
                <ConsentStatusTag status={consent.status} />
              </SummaryListValue>
              <SummaryListAction
                asButton={{ size: "small", variant: "secondary" }}
              >
                <Modal
                  size='md'
                  triggerButton={<button type='button'>Change</button>}
                >
                  <ModalTitle>Update {consent.subject} consent</ModalTitle>
                  <ModalBody className='gi-py-5 modal-body-select'>
                    <Stack direction='column' gap={7}>
                      <FormField className='gi-w-full'>
                        <FormFieldLabel>
                          Select a new consent status for {consent.subject}
                        </FormFieldLabel>
                        <SelectNext
                          onChange={({ target }) =>
                            setSelectedStatus(target.value as Consent["status"])
                          }
                        >
                          <SelectItemNext value='opted-in'>
                            Consent
                          </SelectItemNext>
                          <SelectItemNext value='opted-out'>
                            Decline
                          </SelectItemNext>
                        </SelectNext>
                      </FormField>
                      {error && (
                        <Alert
                          dismissible
                          variant='danger'
                          title='Failed to update consent'
                        >
                          Something went wrong and we couldn't update the
                          consent data. Please try again.
                        </Alert>
                      )}
                    </Stack>
                  </ModalBody>
                  <ModalFooter>
                    <Button
                      variant='primary'
                      disabled={loading}
                      onClick={() => {
                        if (selectedStatus) {
                          handleConsentUpdate(consent.subject, selectedStatus)
                        }
                      }}
                    >
                      {loading && <Spinner />}
                      Save
                    </Button>
                  </ModalFooter>
                </Modal>
              </SummaryListAction>
            </SummaryListRow>
          ))}
        </SummaryList>
      ) : (
        <Alert variant='warning' title='Error'>
          Cannot retrieve latest consent data.
        </Alert>
      )}
    </Stack>
  )
}
