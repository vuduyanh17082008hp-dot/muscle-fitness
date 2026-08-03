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
    return "Email hoặc mật khẩu không chính xác."
  }

  if (
    code === "email_not_confirmed" ||
    message.includes("email not confirmed")
  ) {
    return "Bạn cần xác nhận email trước khi đăng nhập."
  }

  if (
    code === "user_already_exists" ||
    message.includes("already registered") ||
    message.includes("already been registered")
  ) {
    return "Email này đã được đăng ký."
  }

  if (
    code === "weak_password" ||
    message.includes("password should be") ||
    message.includes("weak password")
  ) {
    return "Mật khẩu chưa đủ mạnh. Hãy sử dụng ít nhất 8 ký tự."
  }

  if (
    code === "over_email_send_rate_limit" ||
    message.includes("email rate limit")
  ) {
    return "Bạn đã gửi quá nhiều email. Hãy thử lại sau."
  }

  if (
    code === "same_password" ||
    message.includes("same password")
  ) {
    return "Mật khẩu mới phải khác mật khẩu hiện tại."
  }

  if (
    message.includes("expired") ||
    message.includes("invalid token")
  ) {
    return "Liên kết không hợp lệ hoặc đã hết hạn."
  }

  if (
    message.includes("failed to fetch") ||
    message.includes("fetch failed") ||
    message.includes("network")
  ) {
    return "Không thể kết nối tới máy chủ. Hãy kiểm tra Internet."
  }

  if (message.includes("email is required")) {
    return "Vui lòng nhập email."
  }

  if (message.includes("password is required")) {
    return "Vui lòng nhập mật khẩu."
  }

  return "Không thể hoàn tất yêu cầu. Vui lòng thử lại."
}