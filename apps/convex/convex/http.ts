import { httpAction } from "./_generated/server";
import { httpRouter } from "convex/server";
import { api } from "./_generated/api";

// We verify Clerk webhooks using Svix. In local/dev without a secret, we 401.
export const clerkWebhook = httpAction(async (ctx, request) => {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) return new Response("Missing CLERK_WEBHOOK_SECRET", { status: 500 });

  const svixId = request.headers.get("svix-id");
  const svixTimestamp = request.headers.get("svix-timestamp");
  const svixSignature = request.headers.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return new Response("Missing Svix signature headers", { status: 400 });
  }

  const payload = await request.text();

  // Dynamically import svix to avoid bundling issues if not installed yet.
  let event: any;
  try {
    const mod: any = await import("svix");
    const WebhookCtor = mod?.Webhook || mod?.default?.Webhook || mod?.default;
    if (typeof WebhookCtor !== "function") {
      throw new Error("Invalid Svix import: Webhook constructor not found");
    }
    const wh = new WebhookCtor(secret);
    event = wh.verify(payload, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    });
  } catch (err) {
    console.error("Webhook verification failed", err);
    return new Response("Invalid signature", { status: 400 });
  }

  const type: string = event.type;
  const data: any = event.data;

  // Helpers to extract data safely from Clerk payloads
  const getPrimaryEmail = (user: any): string | undefined => {
    const primaryId = user?.primary_email_address_id;
    const list = user?.email_addresses ?? [];
    const primary = list.find((e: any) => e.id === primaryId)?.email_address;
    return primary || list[0]?.email_address;
  };
  const getPrimaryPhone = (user: any): string | undefined => {
    const primaryId = user?.primary_phone_number_id;
    const list = user?.phone_numbers ?? [];
    const primary = list.find((p: any) => p.id === primaryId)?.phone_number;
    return primary || list[0]?.phone_number;
  };

  try {
    if (type === "user.created" || type === "user.updated") {
      const clerkUserId: string = data.id;
      const email = getPrimaryEmail(data);
      const phone = getPrimaryPhone(data);
      const name = (data.username as string) ||
        [data.first_name, data.last_name].filter(Boolean).join(" ") || undefined;
      const imageUrl: string | undefined = data.image_url || undefined;

      await ctx.runMutation(api.users.upsertFromClerk, {
        clerkUserId,
        email,
        phone,
        name,
        imageUrl,
      });
    } else if (
      type === "organizationMembership.created" ||
      type === "organizationMembership.updated"
    ) {
      const clerkUserId: string =
        data?.public_user_data?.user_id || data?.user_id || data?.id;
      const organizationId: string = data?.organization?.id || data?.organization_id;
      const role: string = data?.role || data?.public_user_data?.role || "member";
      if (clerkUserId && organizationId) {
        await ctx.runMutation(api.orgMemberships.upsertMembership, {
          clerkUserId,
          organizationId,
          role,
        });
      }
    } else if (type === "organizationMembership.deleted") {
      const clerkUserId: string =
        data?.public_user_data?.user_id || data?.user_id || data?.id;
      const organizationId: string = data?.organization?.id || data?.organization_id;
      if (clerkUserId && organizationId) {
        await ctx.runMutation(api.orgMemberships.removeMembership, {
          clerkUserId,
          organizationId,
        });
      }
    } else {
      // Ignore unrelated events
    }
  } catch (err) {
    console.error("Error handling Clerk webhook", type, err);
    return new Response("Error handling webhook", { status: 500 });
  }

  return new Response("ok", { status: 200 });
});

const http = httpRouter();
http.route({ path: "/webhooks/clerk", method: "POST", handler: clerkWebhook });
export default http;
