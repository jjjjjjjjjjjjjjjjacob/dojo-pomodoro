"use client";
import React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Copy } from "lucide-react";
import { Checkbox } from "./ui/checkbox";
import { Label } from "./ui/label";
import { useIsMobile } from "@/hooks/use-mobile";

export type CustomFieldDef = {
  key: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  copyEnabled?: boolean;
};

function CustomFieldPreview({ field }: { field: CustomFieldDef }) {
  if (!field.label || !field.key) return null;

  return (
    <div className="bg-muted/50 rounded p-3 border-l-2 border-primary/20">
      <div className="text-xs text-muted-foreground mb-1">PREVIEW:</div>
      <div className="space-y-1">
        <label className="text-sm font-medium">
          {field.label}{" "}
          {field.required && <span className="text-red-500">*</span>}
        </label>
        <Input
          placeholder={
            field.placeholder || `Enter ${field.label.toLowerCase()}`
          }
          disabled
          className="opacity-60"
        />
      </div>
    </div>
  );
}

export function CustomFieldsBuilderForm() {
  const isMobile = useIsMobile();
  const [fields, setFields] = React.useState<CustomFieldDef[]>([]);
  const set = (
    index: number,
    key: keyof CustomFieldDef,
    value: string | boolean,
  ) =>
    setFields((array) =>
      array.map((item, idx) =>
        idx === index ? { ...item, [key]: value } : item,
      ),
    );
  const remove = (index: number) =>
    setFields((array) => array.filter((_, idx) => idx !== index));
  const add = () =>
    setFields((array) => [
      ...array,
      {
        key: "",
        label: "",
        placeholder: "",
        required: false,
        copyEnabled: false,
      },
    ]);
  const copy = (index: number) => {
    const fieldToCopy = fields[index];
    const copiedField: CustomFieldDef = {
      ...fieldToCopy,
      key: fieldToCopy.key ? `${fieldToCopy.key}_copy` : "",
      label: fieldToCopy.label ? `${fieldToCopy.label} (Copy)` : "",
    };
    setFields((array) => {
      const newArray = [...array];
      newArray.splice(index + 1, 0, copiedField);
      return newArray;
    });
  };

  return (
    <div className="rounded-lg border bg-card p-4 space-y-4">
      <h3 className="font-medium text-sm text-muted-foreground">
        CUSTOM RSVP FIELDS
      </h3>
      <div className="space-y-6">
        {fields.map((field, index) => (
          <div key={index} className="space-y-4">
            {index > 0 && <div className="border-t" />}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Field Configuration */}
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">
                      Field Key
                    </label>
                    <Input
                      placeholder="e.g. instagram, phone, dietary"
                      value={field.key}
                      onChange={(e) => set(index, "key", e.target.value.trim())}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">
                      Display Label
                    </label>
                    <Input
                      placeholder="e.g. Instagram Handle"
                      value={field.label}
                      onChange={(e) =>
                        set(index, "label", e.target.value.trim())
                      }
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">
                    Placeholder Text
                  </label>
                  <Input
                    placeholder="e.g. @username or Enter your dietary restrictions"
                    value={field.placeholder || ""}
                    onChange={(e) =>
                      set(index, "placeholder", e.target.value.trim())
                    }
                  />
                </div>
                <div className="flex items-center justify-between ">
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="text-sm flex items-center gap-1 sm:gap-2 cursor-pointer mb-0 pb-0">
                      <Checkbox
                        id="is-required"
                        checked={!!field.required}
                        onCheckedChange={(copyEnabled) =>
                          set(index, "required", copyEnabled)
                        }
                        className="rounded border-gray-300 mb-0 pb-0"
                      />
                      <Label
                        htmlFor="is-required"
                        className="text-xs sm:text-sm"
                      >
                        Required
                      </Label>
                    </div>
                    <div className="text-sm flex items-center gap-1 sm:gap-2 cursor-pointer">
                      <Checkbox
                        id="copy-enabled"
                        checked={!!field.copyEnabled}
                        onCheckedChange={(copyEnabled) =>
                          set(index, "copyEnabled", copyEnabled)
                        }
                        className="rounded border-gray-300"
                      />
                      <Label
                        htmlFor="copy-enabled"
                        className="text-xs sm:text-sm"
                      >
                        Copy on hover
                      </Label>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size={!isMobile ? "default" : "sm"}
                      onClick={() => copy(index)}
                      className="flex items-center gap-1"
                    >
                      <Copy className="h-3 w-3" />
                      Duplicate
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size={!isMobile ? "default" : "sm"}
                      onClick={() => remove(index)}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              </div>

              {/* Preview */}
              <div className="space-y-2">
                <CustomFieldPreview field={field} />
              </div>
            </div>
          </div>
        ))}

        {fields.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <p className="text-sm">No custom fields added yet.</p>
            <p className="text-xs">
              Custom fields allow you to collect additional information from
              guests during RSVP.
            </p>
          </div>
        )}

        <Button
          type="button"
          variant="outline"
          onClick={add}
          className="w-full"
        >
          + Add Custom Field
        </Button>
      </div>
      <input type="hidden" name="customFields" value={JSON.stringify(fields)} />
    </div>
  );
}

export function CustomFieldsEditor({
  initial,
  onChange,
}: {
  initial?: CustomFieldDef[];
  onChange: (fields: CustomFieldDef[]) => void;
}) {
  const isMobile = useIsMobile();
  const [fields, setFields] = React.useState<CustomFieldDef[]>(initial ?? []);
  React.useEffect(() => {
    onChange(fields);
  }, [fields, onChange]);
  const set = (
    index: number,
    key: keyof CustomFieldDef,
    value: string | boolean,
  ) =>
    setFields((array) =>
      array.map((item, idx) =>
        idx === index ? { ...item, [key]: value } : item,
      ),
    );
  const remove = (index: number) =>
    setFields((array) => array.filter((_, idx) => idx !== index));
  const add = () =>
    setFields((array) => [
      ...array,
      {
        key: "",
        label: "",
        placeholder: "",
        required: false,
        copyEnabled: false,
      },
    ]);
  const copy = (index: number) => {
    const fieldToCopy = fields[index];
    const copiedField: CustomFieldDef = {
      ...fieldToCopy,
      key: fieldToCopy.key ? `${fieldToCopy.key}_copy` : "",
      label: fieldToCopy.label ? `${fieldToCopy.label} (Copy)` : "",
    };
    setFields((array) => {
      const newArray = [...array];
      newArray.splice(index + 1, 0, copiedField);
      return newArray;
    });
  };

  return (
    <div className="rounded-lg border bg-card p-4 space-y-4">
      <h3 className="font-medium text-sm text-muted-foreground">
        CUSTOM RSVP FIELDS
      </h3>
      <div className="space-y-6">
        {fields.map((field, index) => (
          <div key={index} className="space-y-4">
            {index > 0 && <div className="border-t" />}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Field Configuration */}
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">
                      Field Key
                    </label>
                    <Input
                      placeholder="e.g. instagram, phone, dietary"
                      value={field.key}
                      onChange={(e) => set(index, "key", e.target.value.trim())}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">
                      Display Label
                    </label>
                    <Input
                      placeholder="e.g. Instagram Handle"
                      value={field.label}
                      onChange={(e) =>
                        set(index, "label", e.target.value.trim())
                      }
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">
                    Placeholder Text
                  </label>
                  <Input
                    placeholder="e.g. @username or Enter your dietary restrictions"
                    value={field.placeholder || ""}
                    onChange={(e) =>
                      set(index, "placeholder", e.target.value.trim())
                    }
                  />
                </div>
                <div className="flex items-center justify-between w-full gap-2 ">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-sm flex items-center gap-1 cursor-pointer">
                      <Checkbox
                        id="is-required"
                        checked={!!field.required}
                        onCheckedChange={(isRequired) =>
                          set(index, "required", isRequired)
                        }
                        className="rounded border-gray-300"
                      />
                      <Label htmlFor="is-required" className="text-xs">
                        Required
                      </Label>
                    </div>
                    <div className="text-sm flex items-center gap-1 cursor-pointer">
                      <Checkbox
                        id="copy-enabled"
                        checked={!!field.copyEnabled}
                        onCheckedChange={(copyEnabled) =>
                          set(index, "copyEnabled", copyEnabled)
                        }
                        className="rounded hecked:bg-primary border-gray-300"
                      />
                      <Label htmlFor="copy-enabled" className="text-xs">
                        Copy on hover
                      </Label>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size={!isMobile ? "default" : "sm"}
                      onClick={() => copy(index)}
                      className="flex items-center gap-1"
                    >
                      <Copy className="h-3 w-3" />
                      Duplicate
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size={!isMobile ? "lg" : "sm"}
                      onClick={() => remove(index)}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              </div>

              {/* Preview */}
              <div className="space-y-2">
                <CustomFieldPreview field={field} />
              </div>
            </div>
          </div>
        ))}

        {fields.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <p className="text-sm">No custom fields added yet.</p>
            <p className="text-xs">
              Custom fields allow you to collect additional information from
              guests during RSVP.
            </p>
          </div>
        )}

        <Button
          type="button"
          variant="outline"
          onClick={add}
          className="w-full"
        >
          + Add Custom Field
        </Button>
      </div>
    </div>
  );
}
