import { Container, Footer, Header } from "@ogcio/design-system-react"
import { AnalyticsProvider } from "@ogcio/nextjs-analytics"
import type { Metadata } from "next"
import { Suspense } from "react"
import "@ogcio/design-system-react/styles.css"
import "@ogcio/theme-govie/theme.css"
import "../root.css"
import favicon from "@/public/favicon.ico"
import { getEnvConfig } from "@/utils/env"
import { ToastProvider } from "../components/ToastProvider"

export const metadata: Metadata = {
  title: "Messaging Support - OGCIO",
  icons: [{ rel: "icon", url: favicon.src }],
}

const { ANALYTICS_ORGANIZATION_ID, ANALYTICS_URL, ANALYTICS_WEBSITE_ID } =
  getEnvConfig()

const analyticsConfig = {
  baseUrl: ANALYTICS_URL,
  trackingWebsiteId: ANALYTICS_WEBSITE_ID,
  organizationId: ANALYTICS_ORGANIZATION_ID,
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
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
        <Header
          title='Messaging Support'
          items={[
            {
              label: "Log out",
              icon: "logout",
              href: "/api/auth/signout",
              itemType: "link",
              showItemMode: "always",
            },
          ]}
        ></Header>
        <main>
          <Suspense>
            <AnalyticsProvider config={analyticsConfig}>
              <ToastProvider />
              <Container className='gi-p-6'>{children}</Container>
            </AnalyticsProvider>
          </Suspense>
        </main>
        <Footer></Footer>
      </body>
    </html>
  )
}
