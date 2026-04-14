"use client";

import { useState, useRef, useCallback } from "react";
import { format } from "date-fns";
import {
  Upload,
  Download,
  Trash2,
  FileText,
  ImageIcon,
  File,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

import { uploadDocument, deleteDocument } from "@/lib/actions/document-actions";
import type { Document } from "@/lib/types";

const documentTypeLabels: Record<string, string> = {
  "201_file": "201 File",
  nosi: "NOSI",
  nosa: "NOSA",
  service_record: "Service Record",
  leave_form: "Leave Form",
  dtr: "DTR",
  ipcr: "IPCR",
  other: "Other",
};

const documentCategories = [
  { value: "201_file", label: "PDS / 201 File" },
  { value: "other", label: "Appointment Papers" },
  { value: "other", label: "Oath of Office" },
  { value: "other", label: "Certifications" },
  { value: "other", label: "Training Certificates" },
  { value: "other", label: "Other" },
];

function getFileIcon(mimeType: string | null) {
  if (mimeType?.startsWith("image/"))
    return <ImageIcon className="h-4 w-4 text-blue-500" />;
  if (mimeType === "application/pdf")
    return <FileText className="h-4 w-4 text-red-500" />;
  return <File className="h-4 w-4 text-muted-foreground" />;
}

function formatFileSize(bytes: number | null) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentsTab({
  documents,
  employeeId,
}: {
  documents: Document[];
  employeeId: string;
}) {
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [documentType, setDocumentType] = useState("201_file");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.[0]) {
      setSelectedFile(e.dataTransfer.files[0]);
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setUploading(true);
    setUploadProgress(30);

    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("employee_id", employeeId);
    formData.append("document_type", documentType);

    setUploadProgress(60);

    const result = await uploadDocument(formData);

    setUploadProgress(100);

    if ("error" in result && result.error) {
      toast.error(result.error);
    } else {
      toast.success("Document uploaded successfully.");
      setUploadOpen(false);
      setSelectedFile(null);
      setDocumentType("201_file");
    }

    setUploading(false);
    setUploadProgress(0);
  };

  const handleDelete = async () => {
    if (!deleteId) return;

    setDeleting(true);
    const result = await deleteDocument(deleteId, employeeId);

    if ("error" in result && result.error) {
      toast.error(result.error);
    } else {
      toast.success("Document deleted successfully.");
    }

    setDeleting(false);
    setDeleteId(null);
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">201 Files & Documents</CardTitle>
          <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
            <DialogTrigger
              render={<Button variant="outline" size="sm" />}
            >
              <Upload className="h-4 w-4" />
              Upload
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Upload Document</DialogTitle>
                <DialogDescription>
                  Upload a document to this employee&apos;s 201 file. Accepted
                  formats: PDF, JPG, PNG (max 10MB).
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Document Category</Label>
                  <Select
                    value={documentType}
                    onValueChange={(val) => setDocumentType(val ?? "201_file")}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="201_file">PDS / 201 File</SelectItem>
                      <SelectItem value="service_record">
                        Service Record
                      </SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div
                  className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                    dragActive
                      ? "border-primary bg-primary/5"
                      : "border-muted-foreground/25"
                  }`}
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                >
                  {selectedFile ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-center gap-2">
                        {getFileIcon(selectedFile.type)}
                        <span className="font-medium text-sm">
                          {selectedFile.name}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {formatFileSize(selectedFile.size)}
                      </p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedFile(null)}
                      >
                        Remove
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">
                        Drag and drop a file here, or
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        Browse Files
                      </Button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        className="hidden"
                        accept=".pdf,.jpg,.jpeg,.png"
                        onChange={handleFileSelect}
                      />
                    </div>
                  )}
                </div>

                {uploading && (
                  <Progress value={uploadProgress} className="h-2" />
                )}
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setUploadOpen(false);
                    setSelectedFile(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleUpload}
                  disabled={!selectedFile || uploading}
                >
                  {uploading ? "Uploading..." : "Upload"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {documents.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">
              No documents uploaded yet.
            </div>
          ) : (
            <ScrollArea className="max-h-[500px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>File</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Uploaded</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {documents.map((doc) => (
                    <TableRow key={doc.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getFileIcon(doc.mime_type)}
                          <span className="text-sm font-medium">
                            {doc.file_name}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {documentTypeLabels[doc.type] ?? doc.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatFileSize(doc.file_size)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {format(new Date(doc.created_at), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            render={
                              <a
                                href={doc.file_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                download
                              />
                            }
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => setDeleteId(doc.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <AlertDialog
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Document</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this document? This action cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive/10 text-destructive hover:bg-destructive/20"
            >
              {deleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
