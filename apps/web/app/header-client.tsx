"use client";
import {
  SignedIn,
  SignedOut,
  SignInButton,
  SignOutButton,
  useUser,
} from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import Link from "next/link";
import { useTracking } from "@/app/hooks/use-tracking";
import { useEffect } from "react";
import DojoPomodoreIcon from "@/components/icons/dojo-pomodoro-icon";
import { LogOut, LogIn } from "lucide-react";

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

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="lg"
            className="text-primary border-primary/30 aspect-square p-1 animate-in fade-in duration-600"
          >
            <DojoPomodoreIcon size={32} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <SignedIn>
            {/* TODO: Uncomment when profile page is implemented
            <DropdownMenuItem asChild>
              <Link href="/profile" className="flex items-center gap-2">
                <User size={16} />
                Profile
              </Link>
            </DropdownMenuItem>
            */}
            {/* TODO: Uncomment when tickets page is implemented
            <DropdownMenuItem asChild>
              <Link href="/tickets" className="flex items-center gap-2">
                <Ticket size={16} />
                My Tickets
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            */}
            <SignOutButton>
              <DropdownMenuItem
                className="flex items-center gap-2 text-primary! hover:text-primary!"
                onClick={() => trackUserSignOut()}
              >
                <LogOut size={16} className="text-primary" />
                Sign Out
              </DropdownMenuItem>
            </SignOutButton>
          </SignedIn>
          <SignedOut>
            <SignInButton>
              <DropdownMenuItem className="flex items-center gap-2 text-primary! hover:text-primary!">
                <LogIn size={16} className="text-primary" />
                Sign In
              </DropdownMenuItem>
            </SignInButton>
          </SignedOut>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
