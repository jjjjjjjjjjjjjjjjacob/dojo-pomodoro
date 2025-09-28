"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useMutation, useQuery } from "@tanstack/react-query";
import { convexQuery, useConvexMutation } from "@convex-dev/react-query";
import { api } from "@convex/_generated/api";
import { useRef, useState, useEffect } from "react";
import { toast } from "sonner";
import { Camera } from "lucide-react";
import { useSearchParams } from "next/navigation";

export default function ScanPage() {
  const searchParams = useSearchParams();
  const codeFromUrl = searchParams.get("code");
  const [code, setCode] = useState("");
  const [lastAction, setLastAction] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (codeFromUrl) {
      setCode(codeFromUrl.toUpperCase());
      setLastAction("checked");
    }
  }, [codeFromUrl]);

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

  const handleCameraClick = () => {
    fileInputRef.current?.click();
  };

  const handleImageCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      toast.info("Photo captured. Please enter the code manually.");
    }
  };

  return (
    <section className="space-y-3">
      <p className="text-sm">
        Take a photo of the QR code or enter the redemption code manually.
      </p>

      <div className="flex gap-2">
        <Button
          variant="outline"
          onClick={handleCameraClick}
          className="flex items-center gap-2"
        >
          <Camera className="h-4 w-4" />
          Open Camera
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleImageCapture}
        />
      </div>

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
          <div className="text-foreground/70">Last action: {lastAction}</div>
        )}
      </div>
    </section>
  );
}