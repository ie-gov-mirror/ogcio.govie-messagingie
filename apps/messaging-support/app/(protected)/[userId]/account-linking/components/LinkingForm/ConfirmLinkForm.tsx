"use client"

import {
  Accordion,
  AccordionItem,
  Button,
  Heading,
  Paragraph,
  Spinner,
  Stack,
  Table,
  TableBody,
  TableData,
  TableHead,
  TableHeader,
  TableRow,
  Tag,
} from "@ogcio/design-system-react"
import type { LinkProfile } from "@/data/types"

type ConfirmLinkFormProps = {
  profile: LinkProfile
  isPending: boolean
  onFormSubmit: (profileId: string) => void
  onFormCancel: () => void
  primaryProfileId: string
}

export function ConfirmLinkForm(props: ConfirmLinkFormProps) {
  function handleSubmit() {
    props.onFormSubmit(props.profile.id)
  }
  function handleCancel() {
    props.onFormCancel()
  }
  return (
    <>
      <Tag type='info' text='Search Result'></Tag>
      <div>
        <Heading as='h3'>{props.profile.name}</Heading>
        <Paragraph size='sm'>{props.profile.email}</Paragraph>
      </div>
      <Paragraph size='sm'>Logto ID: {props.profile.id}</Paragraph>
      <Accordion>
        {[
          <AccordionItem
            key='linked-account-result-key'
            label={`Linked accounts: ${props.profile.links.length}`}
            disabled={Boolean(!props.profile.links.length)}
          >
            {/* background: var(--gieds-color-gray-50); */}
            <Table noBorder rowSize='sm' style={{ backgroundColor: "#f7f7f8" }}>
              <TableHead>
                <TableRow>
                  <TableHeader>Name</TableHeader>
                  <TableHeader>Email</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {props.profile.links.map((link) => (
                  <TableRow key={`links${link.id}`}>
                    <TableData>{link.name}</TableData>
                    <TableData>{link.email}</TableData>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </AccordionItem>,
        ]}
      </Accordion>
      <Paragraph size='sm'>
        Pressing <strong>Link Accounts</strong> will associate this account as
        child of the parent account. After linking, the accounts will share
        access to messages and other authorized data. The parent will be Account
        ID: {props.primaryProfileId}.
      </Paragraph>
      <Stack direction='row' gap={5}>
        <Button
          variant='secondary'
          onClick={handleCancel}
          disabled={props.isPending}
        >
          Cancel
        </Button>
        <Button type='button' onClick={handleSubmit} disabled={props.isPending}>
          {props.isPending && <Spinner />}
          Link Accounts
        </Button>
      </Stack>
    </>
  )
}
