import {
  redirect,
} from "next/navigation";

/* =========================================================
   STORY PAGE

   The old personal transformation story has been removed.

   /story now redirects to the new short inspirational
   section "The First Rep" on the homepage.
========================================================= */

export default function StoryPage() {
  redirect(
    "/#inspiration",
  );
}
