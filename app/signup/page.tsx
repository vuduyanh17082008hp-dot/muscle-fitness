import {
  redirect,
} from "next/navigation";

/* =========================================================
   SIGNUP ALIAS

   Muscle Fitness uses /register as the canonical account
   creation flow.

   Keeping /signup as an alias ensures old buttons/links
   continue working without maintaining two different
   Supabase signup implementations.
========================================================= */

export default function SignupPage() {
  redirect(
    "/register",
  );
}