import "server-only"
import { cache as reactCache } from "react"
import { requireSession } from "@/app/server-utils/session"

export const getIdentity = reactCache(async () => {
  const payload = await requireSession()
  if (!payload) {
    return null
  }

  return {
    sub: payload.sub as string,
    name: payload.name as string,
    email: payload.email as string,
  }
})
