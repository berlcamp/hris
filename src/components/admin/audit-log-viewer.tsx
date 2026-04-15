"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import { Loader2, Search, CalendarIcon } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { getAuditLogs } from "@/lib/actions/audit-actions";
import type { AuditLogRow } from "@/lib/actions/audit-actions";

const actionColors: Record<string, string> = {
  create: "bg-green-100 text-green-700",
  update: "bg-blue-100 text-blue-700",
  delete: "bg-red-100 text-red-700",
  approve_leave: "bg-emerald-100 text-emerald-700",
  reject_leave: "bg-red-100 text-red-700",
  import_attendance: "bg-purple-100 text-purple-700",
  login: "bg-gray-100 text-gray-700",
};

const tableOptions = [
  { label: "All Tables", value: "_all" },
  { label: "Employees", value: "employees" },
  { label: "Leave Applications", value: "leave_applications" },
  { label: "Attendance Logs", value: "attendance_logs" },
  { label: "NOSI Records", value: "nosi_records" },
  { label: "NOSA Records", value: "nosa_records" },
  { label: "IPCR Records", value: "ipcr_records" },
  { label: "User Profiles", value: "user_profiles" },
];

export function AuditLogViewer() {
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState("");
  const [tableName, setTableName] = useState("_all");
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [startOpen, setStartOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const data = await getAuditLogs({
        userEmail: userEmail || undefined,
        tableName: tableName === "_all" ? undefined : tableName,
        startDate: startDate ? format(startDate, "yyyy-MM-dd") : undefined,
        endDate: endDate ? format(endDate, "yyyy-MM-dd") : undefined,
      });
      setLogs(data);
    } catch {
      toast.error("Failed to load audit logs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, [tableName, startDate, endDate]);

  const handleSearch = () => {
    loadLogs();
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">User Email</label>
          <div className="flex gap-1.5">
            <Input
              value={userEmail}
              onChange={(e) => setUserEmail(e.target.value)}
              placeholder="Search by email..."
              className="w-48"
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            />
            <Button variant="outline" size="icon" onClick={handleSearch}>
              <Search className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Table</label>
          <Select value={tableName} onValueChange={(v) => v && setTableName(v)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {tableOptions.map((t) => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">From</label>
          <Popover open={startOpen} onOpenChange={setStartOpen}>
            <PopoverTrigger
              render={<Button variant="outline" className={cn("w-[140px] justify-start font-normal", !startDate && "text-muted-foreground")} />}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {startDate ? format(startDate, "MMM d") : "Start"}
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={startDate} onSelect={(d) => { setStartDate(d); setStartOpen(false); }} />
            </PopoverContent>
          </Popover>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">To</label>
          <Popover open={endOpen} onOpenChange={setEndOpen}>
            <PopoverTrigger
              render={<Button variant="outline" className={cn("w-[140px] justify-start font-normal", !endDate && "text-muted-foreground")} />}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {endDate ? format(endDate, "MMM d") : "End"}
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={endDate} onSelect={(d) => { setEndDate(d); setEndOpen(false); }} />
            </PopoverContent>
          </Popover>
        </div>

        {(userEmail || tableName !== "_all" || startDate || endDate) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setUserEmail("");
              setTableName("_all");
              setStartDate(undefined);
              setEndDate(undefined);
            }}
          >
            Clear
          </Button>
        )}

        <Badge variant="outline" className="ml-auto">{logs.length} entries</Badge>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="border rounded-md">
          <ScrollArea className="max-h-[60vh]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs w-[140px]">Timestamp</TableHead>
                  <TableHead className="text-xs">User</TableHead>
                  <TableHead className="text-xs text-center">Action</TableHead>
                  <TableHead className="text-xs">Table</TableHead>
                  <TableHead className="text-xs">Record ID</TableHead>
                  <TableHead className="text-xs text-center">Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No audit log entries found.
                    </TableCell>
                  </TableRow>
                ) : (
                  logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-xs font-mono">
                        {format(new Date(log.created_at), "MMM d, HH:mm:ss")}
                      </TableCell>
                      <TableCell className="text-xs">
                        <div>
                          <p className="font-medium">
                            {(log.user_profiles as unknown as { full_name: string } | null)?.full_name ?? "System"}
                          </p>
                          <p className="text-muted-foreground text-[10px]">
                            {log.user_email ?? "—"}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant="outline"
                          className={`text-xs ${actionColors[log.action] ?? ""}`}
                        >
                          {log.action.replace(/_/g, " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs font-mono">
                        {log.table_name ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs font-mono truncate max-w-[120px]">
                        {log.record_id ? log.record_id.slice(0, 8) + "..." : "—"}
                      </TableCell>
                      <TableCell className="text-center">
                        {(log.old_values || log.new_values) ? (
                          <Dialog>
                            <DialogTrigger
                              render={<Button variant="ghost" size="sm" className="text-xs" />}
                            >
                              View
                            </DialogTrigger>
                            <DialogContent className="max-w-lg">
                              <DialogHeader>
                                <DialogTitle>Audit Details</DialogTitle>
                              </DialogHeader>
                              <div className="space-y-3">
                                {log.old_values && (
                                  <div>
                                    <p className="text-xs font-semibold text-muted-foreground mb-1">Old Values</p>
                                    <pre className="text-xs bg-muted rounded-md p-3 overflow-auto max-h-40">
                                      {JSON.stringify(log.old_values, null, 2)}
                                    </pre>
                                  </div>
                                )}
                                {log.new_values && (
                                  <div>
                                    <p className="text-xs font-semibold text-muted-foreground mb-1">New Values</p>
                                    <pre className="text-xs bg-muted rounded-md p-3 overflow-auto max-h-40">
                                      {JSON.stringify(log.new_values, null, 2)}
                                    </pre>
                                  </div>
                                )}
                              </div>
                            </DialogContent>
                          </Dialog>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
