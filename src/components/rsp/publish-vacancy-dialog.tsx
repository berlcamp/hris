"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { addMonths, format, parseISO } from "date-fns";
import { Loader2, Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { publishVacancy } from "@/lib/actions/rsp-actions";
import { publishVacancySchema } from "@/lib/validations/rsp-schema";
import {
  MIN_POSTING_DAYS,
  PUBLICATION_VALIDITY_MONTHS,
} from "@/lib/rsp-constants";

interface PublishVacancyDialogProps {
  vacancyId: string;
}

export function PublishVacancyDialog({ vacancyId }: PublishVacancyDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [publicationDate, setPublicationDate] = useState("");
  const [closingDate, setClosingDate] = useState("");
  const [bulletinNo, setBulletinNo] = useState("");

  const preview = useMemo(() => {
    if (!publicationDate || !closingDate) return null;
    const from = parseISO(publicationDate);
    const to = parseISO(closingDate);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
    const days = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
    const expiry = format(
      addMonths(from, PUBLICATION_VALIDITY_MONTHS),
      "MMM d, yyyy"
    );
    return { days, expiry, ok: days >= MIN_POSTING_DAYS };
  }, [publicationDate, closingDate]);

  const handlePublish = async () => {
    const parsed = publishVacancySchema.safeParse({
      publication_date: publicationDate,
      closing_date: closingDate,
      csc_bulletin_no: bulletinNo,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Invalid dates");
      return;
    }
    setLoading(true);
    const result = await publishVacancy(vacancyId, parsed.data);
    if ("error" in result && result.error) {
      toast.error(result.error);
    } else {
      toast.success("Vacancy published.");
      setOpen(false);
      router.refresh();
    }
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Megaphone className="h-4 w-4" />
        Publish
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Publish Vacancy</DialogTitle>
          <DialogDescription>
            RA 7041 requires posting in at least three conspicuous places for a
            minimum of {MIN_POSTING_DAYS} calendar days. The publication stays
            valid for {PUBLICATION_VALIDITY_MONTHS} months.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Publication / Posting Date *</Label>
            <Input
              type="date"
              value={publicationDate}
              onChange={(e) => setPublicationDate(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Closing Date (deadline of applications) *</Label>
            <Input
              type="date"
              value={closingDate}
              onChange={(e) => setClosingDate(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>CSC Bulletin of Vacant Positions No.</Label>
            <Input
              value={bulletinNo}
              onChange={(e) => setBulletinNo(e.target.value)}
              placeholder="Optional reference number"
            />
          </div>
          {preview && (
            <p
              className={
                preview.ok
                  ? "text-sm text-muted-foreground"
                  : "text-sm text-destructive"
              }
            >
              Posting period: {preview.days} calendar day
              {preview.days === 1 ? "" : "s"}
              {preview.ok
                ? ` — publication valid until ${preview.expiry}.`
                : ` — must be at least ${MIN_POSTING_DAYS} days (RA 7041).`}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={handlePublish}
            disabled={loading || !publicationDate || !closingDate}
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Publish
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
