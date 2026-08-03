"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";

const navigation = [
  {
    label: "MY STORY",
    href: "/story",
  },
  {
    label: "TRAINING COURSE",
    href: "/training-course",
  },
];

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : "";

    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const closeMenu = () => setIsOpen(false);

  return (
    <header className="sticky top-0 z-50 border-b border-[#493b31]/80 bg-[#0d0b0a]/90 backdrop-blur-xl">
      <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-5 lg:px-8">
        <Link
          href="/"
          onClick={closeMenu}
          className="flex min-w-0 items-center gap-3"
          aria-label="Muscle Fitness homepage"
        >
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-md border border-[#b59160] bg-gradient-to-br from-[#a5aaad] to-[#a77b48] font-black text-[#16110d] shadow-lg">
            MF
          </div>

          <div className="min-w-0">
            <div className="truncate text-sm font-black tracking-[0.12em] text-[#f3eadf] sm:text-lg">
              MUSCLE FITNESS
            </div>

            <div className="hidden text-[9px] uppercase tracking-[0.2em] text-[#9f9181] sm:block">
              Discipline built through action
            </div>
          </div>
        </Link>

        <nav className="hidden items-center gap-7 lg:flex">
          {navigation.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-xs font-bold tracking-[0.12em] text-[#c8b9a7] transition hover:text-white"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 sm:flex">
          <Link
            href="/login"
            className="rounded-md border border-[#514438] px-4 py-2.5 text-xs font-bold tracking-wider text-[#e4d7c6] transition hover:border-[#b59160] hover:bg-[#1c1713]"
          >
            LOG IN
          </Link>

          <Link
            href="/signup"
            className="rounded-md border border-[#8a663d] bg-gradient-to-r from-[#d0aa73] to-[#9a7247] px-4 py-2.5 text-xs font-black tracking-wider text-[#17100a] transition hover:-translate-y-0.5 hover:shadow-[0_12px_30px_rgba(181,145,96,0.2)]"
          >
            START FREE
          </Link>
        </div>

        <button
          type="button"
          onClick={() => setIsOpen((current) => !current)}
          className="grid h-11 w-11 place-items-center rounded-md border border-[#514438] text-[#eadfce] sm:hidden"
          aria-label={isOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={isOpen}
        >
          {isOpen ? <X size={21} /> : <Menu size={21} />}
        </button>
      </div>

      {isOpen && (
        <div className="fixed inset-x-0 top-[72px] z-50 min-h-[calc(100dvh-72px)] border-t border-[#493b31] bg-[#0d0b0a] px-5 py-8 sm:hidden">
          <nav className="flex flex-col">
            {navigation.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={closeMenu}
                className="border-b border-[#332a24] py-5 text-lg font-black tracking-[0.08em] text-[#eadfce]"
              >
                {item.label}
              </Link>
            ))}

            <Link
              href="/login"
              onClick={closeMenu}
              className="mt-8 rounded-md border border-[#594a3d] px-5 py-4 text-center text-sm font-black tracking-[0.1em]"
            >
              LOG IN
            </Link>

            <Link
              href="/signup"
              onClick={closeMenu}
              className="mt-3 rounded-md bg-gradient-to-r from-[#d0aa73] to-[#9a7247] px-5 py-4 text-center text-sm font-black tracking-[0.1em] text-[#17100a]"
            >
              START FREE
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}