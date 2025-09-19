"use client";
import {
  SignedIn,
  SignedOut,
  SignInButton,
  SignOutButton,
  useUser,
} from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useTracking } from "@/app/hooks/use-tracking";
import { useEffect } from "react";

function useRoleFlags() {
  const { isSignedIn, user } = useUser();
  const orgRoleSet = new Set(
    user?.organizationMemberships?.map((membership) => membership.role) || [],
  );
  const isHost = isSignedIn && orgRoleSet.has("org:admin" as const);
  const isDoor =
    isSignedIn &&
    (orgRoleSet.has("org:admin" as const) ||
      orgRoleSet.has("org:member" as const));
  return { isHost, isDoor };
}

export default function HeaderClient() {
  const { isHost, isDoor } = useRoleFlags();
  const { isSignedIn } = useUser();
  const { trackUserSignIn, trackUserSignOut } = useTracking();

  // Track sign-in/sign-out state changes
  useEffect(() => {
    if (isSignedIn) {
      trackUserSignIn();
    }
  }, [isSignedIn, trackUserSignIn]);

  return (
    <header className="fixed top-0 w-full flex items-center justify-end gap-2 p-3">
      <SignedIn>
        {isDoor && (
          <Link href="/door">
            <Button variant="outline" size="sm">
              Door Portal
            </Button>
          </Link>
        )}
        {isHost && (
          <Link href="/host">
            <Button size="sm">Host Dashboard</Button>
          </Link>
        )}
      </SignedIn>
      <SignedOut>
        <SignInButton>
          <Button
            variant="outline"
            className="text-primary border-primary/30"
            size="sm"
          >
            Sign in
          </Button>
        </SignInButton>
      </SignedOut>
      <SignedIn>
        <SignOutButton>
          <Button
            variant="outline"
            className="text-primary border-primary/30"
            size="sm"
            onClick={() => trackUserSignOut()}
          >
            Sign out
          </Button>
        </SignOutButton>
      </SignedIn>
    </header>
  );
}
