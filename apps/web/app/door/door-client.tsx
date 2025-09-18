"use client";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { SignedIn, SignedOut, SignInButton, OrganizationSwitcher, useOrganization } from "@clerk/nextjs";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { RedemptionStatusResponse, ClerkOrganization, ApplicationError } from "@/lib/types";

export function DoorPortalClient() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [lastAction, setLastAction] = useState<string | null>(null);
  const status = useQuery(api.redemptions.validate, code ? { code } : "skip") as RedemptionStatusResponse | undefined;
  const redeem = useMutation(api.redemptions.redeem);
  const unredeem = useMutation(api.redemptions.unredeem);
  return (
    <section className="space-y-3">
      <p className="text-sm">Enter a redemption code to validate and redeem.</p>
      <div className="flex gap-2">
        <Input className="flex-1" placeholder="Enter redemption code" value={code} onChange={(e) => setCode(e.target.value)} />
        <Button onClick={() => setLastAction("checked")}>Check</Button>
      </div>
      <div className="rounded border border-foreground/10 p-4 text-sm space-y-2">
        <div>Status: {status ? (status as any).status : "—"}</div>
        {status && (((status as any).status === "valid") || ((status as any).status === "redeemed")) && (
          <div>
            <div>Name: {(status as any).name ?? "(unknown)"}</div>
            <div>List: {(status as any).listKey}</div>
          </div>
        )}
        <div className="flex gap-2">
          <Button disabled={!code || !status || (status as any).status !== "valid"} onClick={async () => { await redeem({ code }); setLastAction("redeemed"); toast.success("Redeemed"); }}>Redeem</Button>
          <Button variant="outline" disabled={!code || !status || (status as any).status !== "redeemed"} onClick={async () => { await unredeem({ code }); setLastAction("unredeemed"); toast.success("Un-redeemed"); }}>Un-redeem</Button>
        </div>
        {lastAction && <div className="text-foreground/70">Last action: {lastAction}</div>}
      </div>
    </section>
  );
}

export function DoorRequestClient() {
  const router = useRouter();
  const { organization } = useOrganization();
  return (
    <section className="space-y-3">
      <div className="rounded border p-4 space-y-2">
        <div className="font-medium">Door access required</div>
        <div className="text-sm text-foreground/70">Select your organization and request door access, or go back home.</div>
        <OrganizationSwitcher appearance={{ elements: { createOrganization: "hidden", createOrganizationButton: "hidden" } }} hidePersonal />
        <div className="flex gap-2">
          <Button onClick={async () => {
            if (!organization) return;
            try {
              const org = organization as ClerkOrganization;
              await org.createMembershipRequest?.({ role: "door" })
                ?? org.membershipRequests?.create?.();
              toast.success("Requested door access");
            } catch (error: unknown) {
              const e = error as ApplicationError & { errors?: Array<{ message: string }> };
              toast.error(e?.errors?.[0]?.message || e?.message || "Request failed");
            }
          }}>Request Door Access</Button>
          <Button variant="outline" onClick={() => router.replace("/")}>Go Home</Button>
        </div>
      </div>
    </section>
  );
}

