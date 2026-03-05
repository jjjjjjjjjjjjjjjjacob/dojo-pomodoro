"use client";

import React, { useState, useEffect } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, Copy, Check, Link } from "lucide-react";
import { toast } from "sonner";

type DecryptedCredential = {
  listKey: string;
  password: string | null;
  credentialId: string;
};

export function ShareEventPopover({
  eventId,
  children,
}: {
  eventId: Id<"events">;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [decryptedCredentials, setDecryptedCredentials] = useState<
    DecryptedCredential[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [copiedBasic, setCopiedBasic] = useState(false);
  const getDecryptedPasswords = useAction(
    api.credentialsNode.getDecryptedPasswordsForEvent,
  );

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      getDecryptedPasswords({ eventId })
        .then((results) => {
          setDecryptedCredentials(results);
        })
        .catch(() => {
          setDecryptedCredentials([]);
        })
        .finally(() => setLoading(false));
    }
  }, [isOpen, eventId, getDecryptedPasswords]);

  const baseUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/events/${eventId}`
      : `/events/${eventId}`;

  const copyToClipboard = async (text: string, index: number | "basic") => {
    try {
      await navigator.clipboard.writeText(text);
      if (index === "basic") {
        setCopiedBasic(true);
        setTimeout(() => setCopiedBasic(false), 2000);
      } else {
        setCopiedIndex(index);
        setTimeout(() => setCopiedIndex(null), 2000);
      }
      toast.success("Link copied to clipboard");
    } catch {
      toast.error("Failed to copy link");
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-80 p-3" align="end">
        <div className="space-y-3">
          <h4 className="font-medium text-sm">Share Event Link</h4>

          {/* Basic link without password */}
          <div className="flex items-center justify-between gap-2 p-2 rounded border bg-muted/20">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-muted-foreground">
                Link only (no password)
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={() => copyToClipboard(baseUrl, "basic")}
            >
              {copiedBasic ? (
                <Check className="h-3 w-3" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
            </Button>
          </div>

          {/* Per-list links with passwords */}
          {loading ? (
            <p className="text-xs text-muted-foreground text-center py-2">
              Loading lists...
            </p>
          ) : decryptedCredentials.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Links with password:
              </p>
              {decryptedCredentials.map((credential, index) => {
                const listUrl = credential.password
                  ? `${baseUrl}?list=${encodeURIComponent(credential.listKey)}&password=${encodeURIComponent(credential.password)}`
                  : `${baseUrl}?list=${encodeURIComponent(credential.listKey)}`;
                return (
                  <div
                    key={credential.credentialId}
                    className="flex items-center justify-between gap-2 p-2 rounded border bg-muted/20"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className="text-xs">
                          {credential.listKey.toUpperCase()}
                        </Badge>
                        {credential.password ? (
                          <span className="text-xs text-muted-foreground truncate">
                            pw: {credential.password}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">
                            no password stored
                          </span>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={() => copyToClipboard(listUrl, index)}
                    >
                      {copiedIndex === index ? (
                        <Check className="h-3 w-3" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
