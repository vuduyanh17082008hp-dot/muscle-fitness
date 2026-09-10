import {
  BriefcaseBusiness,
  UserRound,
} from "lucide-react";
import Link from "next/link";

export default function PortalLoginButtons() {
  return (
    <div className="flex items-center gap-2">
      <Link
        href="/login"
        className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-sm font-medium text-zinc-300 transition hover:bg-white/10 hover:text-white"
      >
        <UserRound className="h-4 w-4" />
        Client Login
      </Link>

      <Link
        href="/admin/login"
        className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-zinc-200"
      >
        <BriefcaseBusiness className="h-4 w-4" />
        Admin Login
      </Link>
    </div>
  );
}