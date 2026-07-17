"use client";

import { useState } from "react";
import { QrCode, Copy, Check, Download } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface EmployeeQrButtonProps {
  employeeName: string;
  /** The public URL the QR encodes (hris.asensoozamiz.com/employee/<uuid>). */
  url: string;
  /** Pre-rendered QR image as a PNG data URL. */
  qrDataUrl: string;
}

export function EmployeeQrButton({
  employeeName,
  url,
  qrDataUrl,
}: EmployeeQrButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Link copied to clipboard.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy the link.");
    }
  };

  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <QrCode className="h-4 w-4" />
        QR Code
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Employee QR Code</DialogTitle>
          <DialogDescription>
            Scan to open {employeeName}&apos;s public record.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrDataUrl}
            alt={`QR code linking to ${employeeName}'s record`}
            className="h-56 w-56 rounded-lg border bg-white p-2"
          />

          <code className="w-full break-all rounded-md bg-muted px-2 py-1.5 text-center text-xs text-muted-foreground">
            {url}
          </code>

          <div className="flex w-full gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={handleCopy}
            >
              {copied ? (
                <Check className="h-4 w-4" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
              {copied ? "Copied" : "Copy link"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex-1"
              render={
                <a
                  href={qrDataUrl}
                  download={`qr-${employeeName.replace(/\s+/g, "-").toLowerCase()}.png`}
                />
              }
            >
              <Download className="h-4 w-4" />
              Download
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
