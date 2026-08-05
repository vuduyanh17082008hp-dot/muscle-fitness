'use server'

import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'

export async function logoutAction() {
  const supabase =
    await createClient()

  const {
    error,
  } =
    await supabase.auth.signOut()

  if (error) {
    console.error(
      'Unable to sign out:',
      error,
    )
  }

  redirect('/login')
}