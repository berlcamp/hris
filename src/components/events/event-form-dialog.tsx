"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  eventMetadataSchema,
  type EventMetadataValues,
} from "@/lib/validations/event-schema";
import { createEvent, updateEvent } from "@/lib/actions/event-actions";
import type { EventRecord } from "@/lib/types";

const blankDefaults: EventMetadataValues = {
  title: "",
  description: "",
  venue: "",
  start_date: "",
  end_date: "",
};

export function EventFormDialog({
  open,
  onOpenChange,
  event,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Null creates; an event edits its metadata. The roster lives on the detail page. */
  event: EventRecord | null;
}) {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<EventMetadataValues>({
    resolver: zodResolver(eventMetadataSchema),
    defaultValues: blankDefaults,
  });

  useEffect(() => {
    if (!open) return;
    reset(
      event
        ? {
            title: event.title,
            description: event.description ?? "",
            venue: event.venue ?? "",
            start_date: event.start_date,
            end_date: event.end_date,
          }
        : blankDefaults,
    );
  }, [open, event, reset]);

  // A one-day event is the common case, so the end date follows the start until
  // somebody deliberately moves it.
  const startDate = watch("start_date");
  const endDate = watch("end_date");
  useEffect(() => {
    if (startDate && (!endDate || endDate < startDate)) {
      setValue("end_date", startDate, { shouldValidate: true });
    }
  }, [startDate, endDate, setValue]);

  const onSubmit = handleSubmit(async (values) => {
    const result = event
      ? await updateEvent(event.id, values)
      : await createEvent(values);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(event ? "Event updated" : "Event created");
    onOpenChange(false);
    if (!event && "data" in result && result.data) {
      router.push(`/events/${result.data.id}`);
    } else {
      router.refresh();
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{event ? "Edit event" : "New event"}</DialogTitle>
          <DialogDescription>
            Attendance is recorded per day, so a multi-day training just needs an
            end date.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="title">Title</Label>
            <Input id="title" {...register("title")} autoComplete="off" />
            {errors.title && (
              <p className="text-destructive text-xs">{errors.title.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="start_date">Start date</Label>
              <Input id="start_date" type="date" {...register("start_date")} />
              {errors.start_date && (
                <p className="text-destructive text-xs">{errors.start_date.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="end_date">End date</Label>
              <Input id="end_date" type="date" {...register("end_date")} />
              {errors.end_date && (
                <p className="text-destructive text-xs">{errors.end_date.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="venue">Venue</Label>
            <Input id="venue" {...register("venue")} autoComplete="off" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" rows={3} {...register("description")} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {event ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
