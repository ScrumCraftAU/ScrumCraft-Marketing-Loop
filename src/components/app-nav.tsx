"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/loop", label: "Loop runs" },
  { href: "/experiments", label: "Experiments" },
  { href: "/metrics", label: "Metrics & sources" },
];

/** Top navigation, on the purple header band. */
export function AppNav() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto [scrollbar-width:none]">
      {LINKS.map((l) => {
        const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "whitespace-nowrap rounded-md px-3 py-1.5 text-sm transition-colors",
              active
                ? "bg-primary-foreground font-bold text-primary"
                : "text-primary-foreground/85 hover:bg-primary-foreground/10 hover:text-primary-foreground",
            )}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
