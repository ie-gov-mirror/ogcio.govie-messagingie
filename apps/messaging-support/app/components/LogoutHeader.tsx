"use client"

import {
  Button,
  Header,
  ModalBody,
  ModalFooter,
  ModalTitle,
  ModalWrapper,
  Paragraph,
} from "@ogcio/design-system-react"
import { useState } from "react"

const signoutHref = "/api/auth/signout"

export function LogoutHeader() {
  const [isOpen, setOpen] = useState(false)

  return (
    <>
      <Header
        title='Messaging Support'
        items={[
          {
            label: "Log out",
            icon: "logout",
            href: signoutHref,
            onClick: (e) => {
              e.preventDefault()
              setOpen(true)
            },
            itemType: "link",
            showItemMode: "always",
          },
        ]}
      ></Header>
      <ModalWrapper isOpen={isOpen} onClose={() => setOpen(false)}>
        <ModalTitle>Sign out of the Super Admin console?</ModalTitle>
        <ModalBody>
          <Paragraph>
            Signing out will also sign you out of your Microsoft account in this
            browser. This includes Outlook, Teams and any other Microsoft 365
            services open in this browser. You will need to sign in again to use
            them.
          </Paragraph>
          <Paragraph>
            If you are stepping away from your device but wish to continue using
            the console, lock your screen instead. This keeps the console
            protected without signing you out of everything else.
          </Paragraph>
          <Paragraph>
            Windows: press Windows key + L
            <br />
            Mac: press Control + Command + Q
          </Paragraph>
        </ModalBody>
        <ModalFooter>
          <Button variant='secondary' onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant='primary'
            onClick={() => window.location.assign(signoutHref)}
          >
            Sign out
          </Button>
        </ModalFooter>
      </ModalWrapper>
    </>
  )
}
