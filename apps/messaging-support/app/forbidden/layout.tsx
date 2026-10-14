import "../root.css"
import "@ogcio/design-system-react/styles.css"
import "@ogcio/theme-govie/theme.css"
import {
  Button,
  Container,
  Footer,
  Header,
  Heading,
  Link,
  List,
  Paragraph,
  Stack,
} from "@ogcio/design-system-react"

export default function Forbidden() {
  return (
    <html lang='en'>
      <head>
        <link
          href='https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined&display=swap'
          rel='stylesheet'
        />
      </head>
      <body>
        <Header
          title='Forbidden'
          items={[
            {
              label: "Logout",
              icon: "logout",
              href: "/api/auth/signout",
              itemType: "link",
              showItemMode: "always",
            },
          ]}
        ></Header>
        <main>
          <Container insetTop='xl'>
            <Stack direction='column' gap={4}>
              <Heading>Forbidden</Heading>
              <Paragraph>
                You do not have permission to access this application.
              </Paragraph>
              <Paragraph>Useful links</Paragraph>
              <List
                items={[
                  <Link
                    key='link1'
                    href='https://dashboard-admin.dev.services.gov.ie'
                  >
                    Admin Dashboard
                  </Link>,
                  <Link
                    key='link2'
                    href='https://dashboard-admin.dev.services.gov.ie'
                  >
                    Citizen Dashboard
                  </Link>,
                  <Link key='link3' href='https://www.ogcio.gov.ie'>
                    OGCIO
                  </Link>,
                ]}
              />
              <Paragraph>
                If you believe this is an error, please contact an administrator
              </Paragraph>
              <form action='/api/auth/signout'>
                <Button>Logout</Button>
              </form>
            </Stack>
          </Container>
        </main>
        <Footer></Footer>
      </body>
    </html>
  )
}
