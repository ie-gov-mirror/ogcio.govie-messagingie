export async function selectOrganization(
  gatewayUrl: string,
  appName: string,
  organizationId: string,
): Promise<boolean> {
  try {
    const app = encodeURIComponent(appName)
    const response = await fetch(
      `${gatewayUrl}/auth/select-organization?app=${app}`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId }),
      },
    )
    return response.ok
  } catch {
    return false
  }
}
