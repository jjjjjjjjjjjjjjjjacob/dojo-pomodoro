import { SignedIn, SignedOut, SignInButton } from "@clerk/nextjs";
import Link from "next/link";
import { checkRole } from "@/lib/rbac";
import { HostRequestClient } from "./request-client";
import { HostNav } from "./nav-client";

export default async function HostLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const isHost = await checkRole(["admin", "host"]);
  return (
    <main className="max-w-5xl mx-auto p-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Host Dashboard</h1>
        <p className="text-sm text-foreground/70">
          Manage events, review RSVPs, and track redemptions.
        </p>
      </header>
      <SignedOut>
        <div className="text-sm">
          Please sign in to access the host dashboard.
        </div>
        <SignInButton>
          <button className="mt-2">Sign in</button>
        </SignInButton>
      </SignedOut>
      <SignedIn>
        {isHost ? (
          <div className="space-y-6">
            <HostNav />
            {children}
          </div>
        ) : (
          <HostRequestClient />
        )}
      </SignedIn>
    </main>
  );
}

// Intentionally no active state logic to keep layout server-only and SSR-friendly.
