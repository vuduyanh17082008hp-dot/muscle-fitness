import { LandingPage } from "@/components/home/landing-page";
import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return <LandingPage signedIn={Boolean(user)} />;
}
