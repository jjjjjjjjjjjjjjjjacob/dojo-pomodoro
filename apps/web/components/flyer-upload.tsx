"use client";
import React from "react";
import { Button } from "@/components/ui/button";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

type Props = {
  value?: string | null; // storageId string
  onChange?: (storageId: string | null) => void;
};

export function FlyerUpload({ value, onChange }: Props) {
  const generateUrl = useMutation(api.files.generateUploadUrl);
  const preview = useQuery(
    api.files.getUrl,
    value ? { storageId: value as Id<"_storage"> } : "skip",
  );
  const [dragOver, setDragOver] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!file.type.startsWith("image/")) {
      alert("Please upload an image file");
      return;
    }
    setUploading(true);
    try {
      const { url } = await generateUrl({});
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || "Upload failed");
      const storageId = json.storageId as string;
      onChange?.(storageId);
    } catch (error: unknown) {
      const errorDetails = error as Error;
      alert(errorDetails?.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-2">
      <div
        className={`rounded border-2 border-dashed p-4 text-sm text-center cursor-pointer ${dragOver ? "bg-foreground/5" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFiles(e.dataTransfer.files);
        }}
        onClick={() => {
          const input = document.createElement("input");
          input.type = "file";
          input.accept = "image/*";
          input.onchange = () => handleFiles(input.files);
          input.click();
        }}
      >
        {uploading ? (
          <div>Uploading…</div>
        ) : value ? (
          <div className="flex items-center gap-3">
            {preview?.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={preview.url}
                alt="Flyer preview"
                className="h-20 w-20 object-cover rounded border"
                onError={(e) => {
                  console.error(
                    "Failed to load flyer preview image:",
                    preview.url,
                  );
                  e.currentTarget.style.display = "none";
                  const fallback = e.currentTarget
                    .nextElementSibling as HTMLElement;
                  if (fallback) fallback.style.display = "block";
                }}
              />
            ) : (
              <div className="h-20 w-20 bg-foreground/10 rounded flex items-center justify-center text-xs text-foreground/50">
                Loading...
              </div>
            )}
            <div
              className="h-20 w-20 bg-foreground/10 rounded flex items-center justify-center text-xs text-foreground/50"
              style={{ display: "none" }}
            >
              Failed to load
            </div>
            <div className="text-left">
              <div className="font-medium">Flyer uploaded</div>
              <div className="text-foreground/70 text-xs break-all">
                {value}
              </div>
              <div className="mt-2 flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => onChange?.(null)}
                >
                  Remove
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div>
            <div className="font-medium">Drag & drop flyer here</div>
            <div className="text-foreground/70">
              or click to select an image
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
