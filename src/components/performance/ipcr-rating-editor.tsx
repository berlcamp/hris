"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { updateIpcrRating } from "@/lib/actions/ipcr-actions";
import { getAdjectivalRating, getRatingColor } from "@/lib/ipcr-utils";

interface IpcrRatingEditorProps {
  recordId: string;
  currentRating: number | null;
  currentRemarks: string | null;
  editable: boolean;
}

export function IpcrRatingEditor({
  recordId,
  currentRating,
  currentRemarks,
  editable,
}: IpcrRatingEditorProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ratingStr, setRatingStr] = useState(
    currentRating?.toFixed(2) ?? ""
  );
  const [remarks, setRemarks] = useState(currentRemarks ?? "");

  const numericalRating = ratingStr ? parseFloat(ratingStr) : null;
  const adjectival =
    numericalRating !== null && !isNaN(numericalRating)
      ? getAdjectivalRating(numericalRating)
      : null;
  const ratingColorClass = getRatingColor(adjectival);

  const isValid =
    numericalRating !== null &&
    !isNaN(numericalRating) &&
    numericalRating >= 1 &&
    numericalRating <= 5;

  const handleSave = async () => {
    if (!isValid || numericalRating === null) return;
    setLoading(true);
    try {
      await updateIpcrRating(recordId, {
        numerical_rating: numericalRating,
        remarks: remarks || undefined,
      });
      toast.success("Rating updated");
      setOpen(false);
      router.refresh();
    } catch {
      toast.error("Failed to update rating");
    } finally {
      setLoading(false);
    }
  };

  if (!editable) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Pencil className="h-4 w-4" />
        Edit Rating
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Update IPCR Rating</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Numerical Rating (1.00 - 5.00)</Label>
            <div className="flex items-center gap-3">
              <Input
                type="number"
                step="0.01"
                min="1"
                max="5"
                value={ratingStr}
                onChange={(e) => setRatingStr(e.target.value)}
                placeholder="e.g., 4.25"
                className="w-32"
              />
              {adjectival && (
                <Badge
                  variant="outline"
                  className={`text-sm ${ratingColorClass}`}
                >
                  {adjectival}
                </Badge>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Remarks (optional)</Label>
            <Textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={loading || !isValid}>
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Save Rating
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
