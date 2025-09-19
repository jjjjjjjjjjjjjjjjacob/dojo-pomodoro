"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useMutation, useQuery } from "@tanstack/react-query";
import { convexQuery, useConvexMutation } from "@convex-dev/react-query";
import { api } from "@convex/_generated/api";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  SignedIn,
  SignedOut,
  SignInButton,
  OrganizationSwitcher,
  useOrganization,
  useAuth,
} from "@clerk/nextjs";
import { toast } from "sonner";
import { Spinner } from "@/components/ui/spinner";
import { ClerkOrganization, ApplicationError } from "@/lib/types";

export default function DoorPortal() {
  const router = useRouter();
  const { organization } = useOrganization();
  const { isLoaded, orgRole, has } = useAuth();
  const isDoor = !!(
    (orgRole && ["admin", "host", "door"].includes(orgRole)) ||
    (typeof has === "function" &&
      (has({ role: "org:admin" }) || has({ role: "org:member" })))
  );
  const [code, setCode] = useState("");
  const [lastAction, setLastAction] = useState<string | null>(null);
  const statusQuery = useQuery(
    convexQuery(api.redemptions.validate, code ? { code } : "skip"),
  );
  const status = statusQuery.data;

  const redeem = useMutation({
    mutationFn: useConvexMutation(api.redemptions.redeem),
  });
  const unredeem = useMutation({
    mutationFn: useConvexMutation(api.redemptions.unredeem),
  });
  // For now, assume door access is approved (will be handled by middleware)
  // TODO: Implement proper door access checking
  const doorApproved = true;

  return (
    <main className="max-w-3xl mx-auto p-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Door Portal</h1>
        <p className="text-sm text-foreground/70">
          Log in to validate and redeem guest entries.
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
                <Button variant="outline" onClick={() => router.replace("/")}>
                  Go Home
                </Button>
              </div>
            </div>
          </section>
        ) : (
          <section className="space-y-3">
            <p className="text-sm">
              Enter a redemption code to validate and redeem.
            </p>
            <div className="flex gap-2">
              <Input
                className="flex-1"
                placeholder="Enter redemption code"
                value={code}
                onChange={(e) => setCode(e.target.value.trim())}
              />
              <Button onClick={() => setLastAction("checked")}>Check</Button>
            </div>
            <div className="rounded border border-foreground/10 p-4 text-sm space-y-2">
              <div>Status: {status ? status.status : "—"}</div>
              {status &&
                (status.status === "valid" || status.status === "redeemed") && (
                  <div>
                    <div>Name: {status.name ?? "(unknown)"}</div>
                    <div>List: {status.listKey}</div>
                  </div>
                )}
              <div className="flex gap-2">
                <Button
                  disabled={!code || !status || status.status !== "valid"}
                  onClick={async () => {
                    await redeem.mutateAsync({ code });
                    setLastAction("redeemed");
                    toast.success("Redeemed");
                  }}
                >
                  Redeem
                </Button>
                <Button
                  variant="outline"
                  disabled={!code || !status || status.status !== "redeemed"}
                  onClick={async () => {
                    await unredeem.mutateAsync({ code });
                    setLastAction("unredeemed");
                    toast("Un-redeemed");
                  }}
                >
                  Un-redeem
                </Button>
              </div>
              {lastAction && (
                <div className="text-foreground/70">
                  Last action: {lastAction}
                </div>
              )}
            </div>
          </section>
        )}
      </SignedIn>
    </main>
  );
}
