import { Container, Footer, Header } from "@ogcio/design-system-react"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { use } from "react"
import { cookieNameSession } from "@/utils/cookies"

export default function AuthLayout({ children }: React.PropsWithChildren) {
  const cookieStore = use(cookies())
  const sessionCookie = cookieStore.get(cookieNameSession)?.value
  if (sessionCookie) {
    redirect("/")
  }

  return (
    <html lang='en'>
      <head>
        <link
          href='https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined&display=swap'
          rel='stylesheet'
        />
      </head>
      <body>
        <Header title='Authentication Error'></Header>
        <main>
          <Container insetTop='xl'>{children}</Container>
        </main>
        <Footer></Footer>
      </body>
    </html>
  )
}
