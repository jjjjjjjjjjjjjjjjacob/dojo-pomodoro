"use client";

import { ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  SignedIn,
  SignedOut,
  SignInButton,
  OrganizationSwitcher,
  useOrganization,
  useAuth,
} from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";
import { ClerkOrganization, ApplicationError } from "@/lib/types";

export default function DoorLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { organization } = useOrganization();
  const { isLoaded, orgRole, has } = useAuth();

  const isDoor = !!(
    (orgRole && ["admin", "host", "door"].includes(orgRole)) ||
    (typeof has === "function" &&
      (has({ role: "org:admin" }) || has({ role: "org:member" })))
  );

  const currentTab = pathname?.split("/")[2] || "scan";

  return (
    <main className="max-w-6xl mx-auto p-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Door Portal</h1>
        <p className="text-sm text-foreground/70">
          Validate and redeem guest entries, view tickets, and check guest lists.
        </p>
      </header>

      <SignedOut>
        <div className="text-sm">Please sign in to access the door portal.</div>
        <SignInButton>
          <Button className="mt-2">Sign in</Button>
        </SignInButton>
      </SignedOut>

      <SignedIn>
        {!isLoaded ? (
          <div className="flex text-primary items-center justify-center py-10">
            <Spinner />
          </div>
        ) : !isDoor ? (
          <section className="space-y-3">
            <div className="rounded border p-4 space-y-2">
              <div className="font-medium">Door access required</div>
              <div className="text-sm text-foreground/70">
                Select your organization and request door access, or go back
                home.
              </div>
              <OrganizationSwitcher
                appearance={{
                  elements: {
                    createOrganization: "hidden",
                    createOrganizationButton: "hidden",
                  },
                }}
                hidePersonal
              />
              <div className="flex gap-2">
                <Button
                  onClick={async () => {
                    if (!organization) {
                      return;
                    }
                    try {
                      const org = organization as ClerkOrganization;
                      (await org.createMembershipRequest?.({
                        role: "door",
                      })) ?? org.membershipRequests?.create?.();
                      toast.success("Requested door access");
                    } catch (error: unknown) {
                      const e = error as ApplicationError & {
                        errors?: Array<{ message: string }>;
                      };
                      toast.error(
                        e?.errors?.[0]?.message ||
                          e?.message ||
                          "Request failed",
                      );
                    }
                  }}
                >
                  Request Door Access
                </Button>
                <Button variant="outline" onClick={() => router.push("/")}>
                  Go Home
                </Button>
              </div>
            </div>
          </section>
        ) : (
          <>
            <Tabs value={currentTab} onValueChange={(value) => router.push(`/door/${value}`)}>
              <TabsList>
                <TabsTrigger value="scan">Scan</TabsTrigger>
                <TabsTrigger value="ticket">Get Ticket</TabsTrigger>
                <TabsTrigger value="list">Guest List</TabsTrigger>
              </TabsList>
            </Tabs>
            {children}
          </>
        )}
      </SignedIn>
    </main>
  );
}