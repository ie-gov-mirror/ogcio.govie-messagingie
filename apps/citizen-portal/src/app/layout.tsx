import { Lato } from "next/font/google"
import { SwrProvider } from "@/components/swr-provider"
import "@ogcio/design-system-react/styles.css"
import "@ogcio/theme-govie/theme.css"
import "./font-override.css"
import "./link-no-visited.css"

const lato = Lato({
  weight: ["400", "700"],
  subsets: ["latin", "latin-ext"],
  display: "swap",
  variable: "--font-lato",
})

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    // biome-ignore lint/a11y/useHtmlLang: lang is set dynamically per-locale via inline script in [locale]/layout.tsx
    <html suppressHydrationWarning className={lato.variable}>
      <body className='gi-flex gi-flex-col' style={{ minHeight: "100vh" }}>
        <SwrProvider>{children}</SwrProvider>
      </body>
    </html>
  )
}
