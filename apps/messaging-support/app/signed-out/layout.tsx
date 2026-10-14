import "../root.css"
import "@ogcio/design-system-react/styles.css"
import "@ogcio/theme-govie/theme.css"
import { Container, Footer, Header } from "@ogcio/design-system-react"

export default function SignedOutLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang='en'>
      <head>
        <link
          href='https://fonts.googleapis.com/css2?family=Lato:ital,wght@0,100;0,300;0,400;0,700;0,900;1,100;1,300;1,400;1,700;1,900&display=swap'
          rel='stylesheet'
        />
        <link
          href='https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined&display=swap'
          rel='stylesheet'
        />
      </head>
      <body>
        <Header title='Messaging Support'></Header>
        <main>
          <Container className='gi-p-6'>{children}</Container>
        </main>
        <Footer></Footer>
      </body>
    </html>
  )
}
