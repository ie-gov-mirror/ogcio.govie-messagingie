export const authErrors = {
  missing_code_or_state: "Authentication failed. Please try again.",
  oauth_error: "Authentication failed. Please try again.",
  invalid_state: "Invalid request detected. Please retry login.",
  missing_nonce_cookie: "Your session expired. Please login again.",
  invalid_nonce: "Authentication failed. Please retry.",
  token_exchange_failed: "Could not log you in. Please try again later.",
  unknown: "An unknown error occurred. Please try again.",
} as const

export type AuthErrorKey = keyof typeof authErrors

export function isAuthError(s: string): s is AuthErrorKey {
  return Boolean(authErrors[s as AuthErrorKey])
}
