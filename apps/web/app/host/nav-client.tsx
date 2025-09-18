"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function HostNav() {
  const pathname = usePathname();
  const link = (href: string, label: string) => {
    const active = pathname === href;
    return (
      <Link
        key={href}
        href={href}
        className={`px-3 py-1.5 text-sm rounded-md border ${active ? "bg-foreground/5 border-foreground/20" : "border-transparent hover:bg-foreground/5"}`}
      >
        {label}
      </Link>
    );
  };
  return (
    <nav className="flex gap-2 border-b border-foreground/10 pb-2">
      {link("/host/events", "Events")}
      {link("/host/new", "New Event")}
      {link("/host/rsvps", "RSVPs")}
    </nav>
  );
}
