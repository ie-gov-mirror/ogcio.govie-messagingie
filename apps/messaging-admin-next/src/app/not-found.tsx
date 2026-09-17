import { Heading, Link, Paragraph, Stack } from "@ogcio/design-system-react"

export default function NotFound() {
  return (
    <div role='alert'>
      <Stack direction='column' gap={10}>
        <Heading as='h1'>Page not found</Heading>
        <Paragraph>The page you are looking for could not be found.</Paragraph>
        <Link href='/en/send-a-message'>Return to admin</Link>
      </Stack>
    </div>
  )
}
