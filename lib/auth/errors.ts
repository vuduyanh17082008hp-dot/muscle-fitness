type AuthErrorLike = {
  message?: unknown
  code?: unknown
}

export function getFriendlyAuthError(
  error: unknown
): string {
  const authError =
    typeof error === "object" && error !== null
      ? (error as AuthErrorLike)
      : null

  const code = String(authError?.code ?? "").toLowerCase()
  const message = String(
    authError?.message ?? error ?? ""
  ).toLowerCase()

  if (
    code === "invalid_credentials" ||
    message.includes("invalid login credentials")
  ) {
    return "Incorrect email or password."
  }

  if (
    code === "email_not_confirmed" ||
    message.includes("email not confirmed")
  ) {
    return "Please confirm your email before logging in."
  }

  if (
    code === "user_already_exists" ||
    message.includes("already registered") ||
    message.includes("already been registered")
  ) {
    return "This email is already registered."
  }

  if (
    code === "weak_password" ||
    message.includes("password should be") ||
    message.includes("weak password")
  ) {
    return "Password is too weak. Use at least 8 characters."
  }

  if (
    code === "over_email_send_rate_limit" ||
    message.includes("email rate limit")
  ) {
    return "Too many emails sent. Please try again later."
  }

  if (
    code === "same_password" ||
    message.includes("same password")
  ) {
    return "Your new password must be different from your current one."
  }

  if (
    message.includes("expired") ||
    message.includes("invalid token")
  ) {
    return "This link is invalid or has expired."
  }

  if (
    message.includes("failed to fetch") ||
    message.includes("fetch failed") ||
    message.includes("network")
  ) {
    return "Can't reach the server. Check your internet connection and try again."
  }

  if (message.includes("email is required")) {
    return "Please enter your email address."
  }

  if (message.includes("password is required")) {
    return "Please enter your password."
  }

  return "We couldn't complete your request. Please try again."
}