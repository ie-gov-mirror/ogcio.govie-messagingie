import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { cookieNameLoggedOut } from "@/utils/cookies"
import { requireSession } from "./session"

export default async function AuthWrapper({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await requireSession()
  if (!session) {
    const cookieStore = await cookies()
    if (cookieStore.get(cookieNameLoggedOut)?.value === "1") {
      redirect("/signed-out")
    }
    redirect("/api/auth/signin")
  }

  return <>{children}</>
}
