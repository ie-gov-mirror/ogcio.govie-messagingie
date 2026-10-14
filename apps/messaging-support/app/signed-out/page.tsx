import { Heading, Link, Paragraph, Stack } from "@ogcio/design-system-react"

export default function SignedOutPage() {
  return (
    <Stack direction='column' gap={4}>
      <Heading>Signed out</Heading>
      <Paragraph>You are signed out of Messaging Support.</Paragraph>
      <Link href='/api/auth/signin'>Sign in</Link>
    </Stack>
  )
}
