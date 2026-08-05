"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { useRouter } from "next/navigation"
import type {
  AuthChangeEvent,
  Session,
  User,
} from "@supabase/supabase-js"

import { createClient } from "@/lib/supabase/client"

type AuthContextValue = {
  user: User | null
  session: Session | null
  loading: boolean
  isAuthenticated: boolean
  refreshUser: () => Promise<void>
  signOut: () => Promise<void>
}

type AuthProviderProps = {
  children: ReactNode
}

const AuthContext = createContext<AuthContextValue | undefined>(
  undefined
)

export function AuthProvider({
  children,
}: AuthProviderProps) {
  const router = useRouter()

  /*
   * createClient() trong lib/supabase/client.ts nên trả về
   * cùng một browser client để tránh tạo nhiều auth listeners.
   */
  const supabase = useMemo(() => createClient(), [])

  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  /**
   * Cập nhật session và user cùng lúc để tránh trạng thái lệch nhau.
   */
  const updateAuthState = useCallback(
    (nextSession: Session | null) => {
      setSession(nextSession)
      setUser(nextSession?.user ?? null)
    },
    []
  )

  useEffect(() => {
    let isMounted = true

    /**
     * Đọc session ban đầu khi website được mở hoặc refresh.
     */
    const loadInitialSession = async () => {
      try {
        const {
          data: { session: initialSession },
          error,
        } = await supabase.auth.getSession()

        if (error) {
          throw error
        }

        if (!isMounted) {
          return
        }

        updateAuthState(initialSession)
      } catch (error) {
        console.error(
          "Could not load the current authentication session:",
          error
        )

        if (isMounted) {
          updateAuthState(null)
        }
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    void loadInitialSession()

    /**
     * Theo dõi các thay đổi:
     * - Đăng nhập
     * - Đăng xuất
     * - Refresh access token
     * - Cập nhật user
     * - Khôi phục password
     *
     * Hai kiểu dưới đây sửa trực tiếp lỗi TS7006:
     * event: AuthChangeEvent
     * nextSession: Session | null
     */
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (
        event: AuthChangeEvent,
        nextSession: Session | null
      ) => {
        if (!isMounted) {
          return
        }

        updateAuthState(nextSession)
        setLoading(false)

        /*
         * Refresh Server Components sau những thay đổi quan trọng.
         *
         * Không refresh khi TOKEN_REFRESHED vì có thể gây reload
         * giao diện không cần thiết trong lúc client đang sử dụng web.
         */
        if (
          event === "SIGNED_IN" ||
          event === "SIGNED_OUT" ||
          event === "USER_UPDATED"
        ) {
          window.setTimeout(() => {
            router.refresh()
          }, 0)
        }
      }
    )

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [router, supabase, updateAuthState])

  /**
   * Chủ động lấy lại session hiện tại.
   * Có thể sử dụng sau khi client cập nhật profile.
   */
  const refreshUser = useCallback(async () => {
    setLoading(true)

    try {
      const {
        data: { session: currentSession },
        error,
      } = await supabase.auth.getSession()

      if (error) {
        throw error
      }

      updateAuthState(currentSession)
      router.refresh()
    } catch (error) {
      console.error(
        "Could not refresh the authenticated user:",
        error
      )

      updateAuthState(null)
    } finally {
      setLoading(false)
    }
  }, [router, supabase, updateAuthState])

  /**
   * Đăng xuất khỏi browser hiện tại.
   */
  const signOut = useCallback(async () => {
    setLoading(true)

    try {
      const { error } = await supabase.auth.signOut({
        scope: "local",
      })

      if (error) {
        throw error
      }

      updateAuthState(null)

      router.replace("/login")
      router.refresh()
    } catch (error) {
      console.error("Could not sign out:", error)
      throw error
    } finally {
      setLoading(false)
    }
  }, [router, supabase, updateAuthState])

  const contextValue = useMemo<AuthContextValue>(
    () => ({
      user,
      session,
      loading,
      isAuthenticated: Boolean(user && session),
      refreshUser,
      signOut,
    }),
    [
      user,
      session,
      loading,
      refreshUser,
      signOut,
    ]
  )

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  )
}

/**
 * Hook sử dụng AuthContext trong Client Components.
 */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)

  if (context === undefined) {
    throw new Error(
      "useAuth must be used inside an AuthProvider."
    )
  }

  return context
}