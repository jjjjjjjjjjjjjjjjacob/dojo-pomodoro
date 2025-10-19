"use client";

import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectOption } from "@/components/ui/select";
import type { Event, TextBlast, TextBlastStatus } from "@/lib/types";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Separator } from "@/components/ui/separator";
import { Send, Save, Eye, Users, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { formatEventTitleInline } from "@/lib/event-display";

interface TextBlastDialogProps {
  isOpen: boolean;
  onClose: () => void;
  blastId?: Id<"textBlasts"> | null;
}

interface FormData {
  eventId: Id<"events"> | "";
  name: string;
  message: string;
  targetLists: string[];
}

const SMS_CHAR_LIMIT = 160;
const SMS_CONCAT_LIMIT = 320;

export default function TextBlastDialog({
  isOpen,
  onClose,
  blastId,
}: TextBlastDialogProps) {
  const events = useQuery(api.events.listAll, {}) as Event[] | undefined;
  const existingBlast = useQuery(
    api.textBlasts.getBlastById,
    blastId ? { blastId } : "skip",
  ) as TextBlast | null | undefined;
  const createDraftMutation = useMutation(api.textBlasts.createDraft);
  const updateDraftMutation = useMutation(api.textBlasts.updateDraft);
  const sendBlastAction = useAction(api.textBlasts.sendBlast);

  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<FormData>({
    eventId: "",
    name: "",
    message: "",
    targetLists: [],
  });
  const [recipientCount, setRecipientCount] = useState(0);
  const [previewMode, setPreviewMode] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const isEditMode = !!blastId;
  const selectedEvent = events?.find(event => event._id === formData.eventId);

  // Get available lists for selected event
  const availableLists = useMemo(() => {
    if (!selectedEvent) return [] as string[];
    // Mock list - in real app, get from event or RSVP data
    return ["vip", "ga", "premium"];
  }, [selectedEvent]);

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (isOpen) {
      if (existingBlast) {
        setFormData({
          eventId: existingBlast.eventId,
          name: existingBlast.name,
          message: existingBlast.message,
          targetLists: existingBlast.targetLists,
        });
        setRecipientCount(existingBlast.recipientCount);
        setCurrentStep(1);
      } else {
        setFormData({
          eventId: "",
          name: "",
          message: "",
          targetLists: [],
        });
        setRecipientCount(0);
        setCurrentStep(1);
      }
      setPreviewMode(false);
    }
  }, [isOpen, existingBlast]);

  // Calculate character count and message type
  const messageLength = formData.message.length;
  const messageType = messageLength <= SMS_CHAR_LIMIT ? "SMS" :
                     messageLength <= SMS_CONCAT_LIMIT ? "Long SMS" : "Too Long";
  const isMessageTooLong = messageLength > SMS_CONCAT_LIMIT;

  // Template variables for message preview
  const sampleData = {
    firstName: "John",
    eventName: selectedEvent?.name || "Sample Event",
    eventDate: selectedEvent ? new Date(selectedEvent.eventDate).toLocaleDateString() : "Dec 31, 2024",
    eventLocation: selectedEvent?.location || "Sample Location",
  };

  const previewMessage = formData.message
    .replace(/\{\{firstName\}\}/g, sampleData.firstName)
    .replace(/\{\{eventName\}\}/g, sampleData.eventName)
    .replace(/\{\{eventDate\}\}/g, sampleData.eventDate)
    .replace(/\{\{eventLocation\}\}/g, sampleData.eventLocation);

  const handleEventChange = (eventId: Id<"events"> | "") => {
    setFormData(prev => ({
      ...prev,
      eventId,
      targetLists: [], // Reset target lists when event changes
    }));
    setRecipientCount(0);
  };

  const handleTargetListChange = (listKey: string, checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      targetLists: checked
        ? [...prev.targetLists, listKey]
        : prev.targetLists.filter(key => key !== listKey),
    }));
  };

  const handleSaveDraft = async () => {
    try {
      if (isEditMode && blastId) {
        await updateDraftMutation({
          blastId,
          name: formData.name,
          message: formData.message,
          targetLists: formData.targetLists,
        });
        toast.success("Text blast updated successfully");
      } else {
        if (!formData.eventId) {
          toast.error("Select an event before saving the draft");
          return;
        }
        await createDraftMutation({
          eventId: formData.eventId,
          name: formData.name,
          message: formData.message,
          targetLists: formData.targetLists,
        });
        toast.success("Text blast draft saved successfully");
      }
      onClose();
    } catch (error: any) {
      toast.error(error.message || "Failed to save text blast");
    }
  };

  const handleSendBlast = async () => {
    if (!blastId) {
      toast.error("Please save as draft first");
      return;
    }

    setIsSending(true);
    try {
      const result = await sendBlastAction({ blastId });
      if (result.success) {
        toast.success(
          `Text blast sent successfully! ${result.sentCount} messages delivered.`,
        );
      } else {
        toast.error(result.message || "Failed to send text blast");
      }
      onClose();
    } catch (error: any) {
      toast.error(error.message || "Failed to send text blast");
    } finally {
      setIsSending(false);
    }
  };

  const canProceedToStep2 = formData.eventId && formData.name && formData.message;
  const canProceedToStep3 = canProceedToStep2 && formData.targetLists.length > 0;
  const canSave = canProceedToStep3 && !isMessageTooLong;

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="eventId">Event</Label>
              <Select
                value={formData.eventId}
                onValueChange={(value) =>
                  handleEventChange(value ? (value as Id<"events">) : "")
                }
              >
                <SelectOption value="">Select an event</SelectOption>
                {events?.map((event) => {
                  const inlineTitle = formatEventTitleInline(event);
                  return (
                <SelectOption key={event._id} value={event._id}>
                      {inlineTitle}
                    </SelectOption>
                  );
                })}
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">Campaign Name</Label>
              <Input
                id="name"
                placeholder="e.g. Event Reminder, Last Call, etc."
                value={formData.name}
                onChange={(e) =>
                  setFormData(prev => ({ ...prev, name: e.target.value }))
                }
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="message">Message</Label>
                <div className="flex items-center gap-2 text-sm">
                  <Badge
                    variant={
                      isMessageTooLong
                        ? "destructive"
                        : messageLength > SMS_CHAR_LIMIT
                        ? "secondary"
                        : "outline"
                    }
                  >
                    {messageLength}/{SMS_CONCAT_LIMIT}
                  </Badge>
                  <span className="text-muted-foreground">{messageType}</span>
                </div>
              </div>
              <Textarea
                id="message"
                placeholder="Your message here... Use {{firstName}}, {{eventName}}, {{eventDate}}, {{eventLocation}} for personalization"
                value={formData.message}
                onChange={(e) =>
                  setFormData(prev => ({ ...prev, message: e.target.value }))
                }
                rows={6}
                className={isMessageTooLong ? "border-destructive" : ""}
              />
              <div className="text-xs text-muted-foreground">
                Available variables: &#123;&#123;firstName&#125;&#125;, &#123;&#123;eventName&#125;&#125;, &#123;&#123;eventDate&#125;&#125;, &#123;&#123;eventLocation&#125;&#125;
              </div>
              {isMessageTooLong && (
                <div className="text-xs text-destructive">
                  Message is too long. Please keep it under {SMS_CONCAT_LIMIT} characters.
                </div>
              )}
            </div>

            {formData.message && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Preview</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPreviewMode(!previewMode)}
                  >
                    <Eye className="h-4 w-4 mr-1" />
                    {previewMode ? "Hide" : "Show"} Preview
                  </Button>
                </div>
                {previewMode && (
                  <Card>
                    <CardContent className="p-3">
                      <div className="text-sm whitespace-pre-wrap">
                        {previewMessage}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </div>
        );

      case 2:
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Select Recipient Lists</Label>
              <div className="grid gap-3">
                {availableLists.map(listKey => (
                  <div key={listKey} className="flex items-center space-x-2">
                    <Checkbox
                      id={listKey}
                      checked={formData.targetLists.includes(listKey)}
                      onCheckedChange={(checked) =>
                        handleTargetListChange(listKey, checked as boolean)
                      }
                    />
                    <Label htmlFor={listKey} className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="font-medium capitalize">{listKey}</span>
                        <Badge variant="outline">
                          <Users className="h-3 w-3 mr-1" />
                          ~50 recipients
                        </Badge>
                      </div>
                    </Label>
                  </div>
                ))}
              </div>
              {formData.targetLists.length === 0 && (
                <div className="text-sm text-muted-foreground">
                  Please select at least one recipient list.
                </div>
              )}
            </div>

            {formData.targetLists.length > 0 && (
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Total Recipients</span>
                    <Badge>
                      <Users className="h-3 w-3 mr-1" />
                      {recipientCount || "Calculating..."}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        );

      case 3:
        return (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  Review & Send
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-sm font-medium">Event</Label>
                  <p className="text-sm text-muted-foreground">
                    {selectedEvent?.name}
                  </p>
                </div>

                <div>
                  <Label className="text-sm font-medium">Campaign Name</Label>
                  <p className="text-sm text-muted-foreground">{formData.name}</p>
                </div>

                <div>
                  <Label className="text-sm font-medium">Message</Label>
                  <Card>
                    <CardContent className="p-3">
                      <div className="text-sm whitespace-pre-wrap">
                        {previewMessage}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <div>
                  <Label className="text-sm font-medium">Recipients</Label>
                  <div className="flex gap-2 mt-1">
                    {formData.targetLists.map(listKey => (
                      <Badge key={listKey} variant="outline">
                        {listKey.toUpperCase()}
                      </Badge>
                    ))}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {recipientCount} total recipients
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditMode ? "Edit Text Blast" : "Create Text Blast"}
          </DialogTitle>
          <DialogDescription>
            Send bulk SMS messages to event attendees. Step {currentStep} of 3.
          </DialogDescription>
        </DialogHeader>

        {/* Step Indicators */}
        <div className="flex items-center justify-center space-x-4 py-4">
          {[1, 2, 3].map((step) => (
            <div key={step} className="flex items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  step === currentStep
                    ? "bg-primary text-primary-foreground"
                    : step < currentStep
                    ? "bg-green-500 text-white"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {step}
              </div>
              {step < 3 && (
                <div
                  className={`w-12 h-0.5 mx-2 ${
                    step < currentStep ? "bg-green-500" : "bg-muted"
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        <Separator />

        {/* Step Content */}
        <div className="py-4">{renderStepContent()}</div>

        <DialogFooter className="flex justify-between">
          <div className="flex gap-2">
            {currentStep > 1 && (
              <Button
                variant="outline"
                onClick={() => setCurrentStep(currentStep - 1)}
              >
                Back
              </Button>
            )}
          </div>

          <div className="flex gap-2">
            {currentStep < 3 ? (
              <Button
                onClick={() => setCurrentStep(currentStep + 1)}
                disabled={
                  (currentStep === 1 && !canProceedToStep2) ||
                  (currentStep === 2 && !canProceedToStep3)
                }
              >
                Next
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={handleSaveDraft}
                  disabled={!canSave}
                >
                  <Save className="h-4 w-4 mr-2" />
                  Save Draft
                </Button>

                {isEditMode && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button disabled={!canSave || isSending}>
                        <Send className="h-4 w-4 mr-2" />
                        {isSending ? "Sending..." : "Send Now"}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Send Text Blast</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to send this text blast to {recipientCount} recipients?
                          This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleSendBlast}>
                          Send {recipientCount} Messages
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
