"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Loader2, UserCog } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  createDepartment,
  updateDepartment,
  deleteDepartment,
  setDepartmentHead,
  getDepartmentEmployeeOptions,
  type DepartmentRow,
  type DepartmentEmployeeOption,
} from "@/lib/actions/department-actions";

const NO_HEAD = "none";

interface DepartmentManagerProps {
  departments: DepartmentRow[];
}

export function DepartmentManager({ departments }: DepartmentManagerProps) {
  const router = useRouter();

  // Create / edit dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<DepartmentRow | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [saving, setSaving] = useState(false);

  // Set-head dialog
  const [headDialogOpen, setHeadDialogOpen] = useState(false);
  const [headDept, setHeadDept] = useState<DepartmentRow | null>(null);
  const [headOptions, setHeadOptions] = useState<DepartmentEmployeeOption[]>([]);
  const [selectedHead, setSelectedHead] = useState<string>(NO_HEAD);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [savingHead, setSavingHead] = useState(false);

  const resetForm = () => {
    setName("");
    setCode("");
    setEditing(null);
  };

  const openCreate = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (dept: DepartmentRow) => {
    setEditing(dept);
    setName(dept.name);
    setCode(dept.code);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim() || !code.trim()) {
      toast.error("Name and code are required");
      return;
    }
    setSaving(true);
    const result = editing
      ? await updateDepartment(editing.id, { name, code })
      : await createDepartment({ name, code });
    setSaving(false);

    if ("error" in result && result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(editing ? "Department updated" : "Department created");
    setDialogOpen(false);
    resetForm();
    router.refresh();
  };

  const handleDelete = async (id: string) => {
    const result = await deleteDepartment(id);
    if (result && "error" in result) {
      toast.error(result.error);
      return;
    }
    toast.success("Department deleted");
    router.refresh();
  };

  const openHeadDialog = async (dept: DepartmentRow) => {
    setHeadDept(dept);
    setSelectedHead(dept.head_employee_id ?? NO_HEAD);
    setHeadOptions([]);
    setHeadDialogOpen(true);
    setLoadingOptions(true);
    try {
      const options = await getDepartmentEmployeeOptions(dept.id);
      setHeadOptions(options);
    } catch {
      toast.error("Failed to load employees");
    } finally {
      setLoadingOptions(false);
    }
  };

  const handleSaveHead = async () => {
    if (!headDept) return;
    setSavingHead(true);
    const result = await setDepartmentHead(
      headDept.id,
      selectedHead === NO_HEAD ? null : selectedHead
    );
    setSavingHead(false);

    if ("error" in result && result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Department head updated");
    setHeadDialogOpen(false);
    router.refresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog
          open={dialogOpen}
          onOpenChange={(o) => {
            setDialogOpen(o);
            if (!o) resetForm();
          }}
        >
          <DialogTrigger render={<Button size="sm" onClick={openCreate} />}>
            <Plus className="h-4 w-4" />
            New Department
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editing ? "Edit Department" : "Create Department"}
              </DialogTitle>
              <DialogDescription>
                Departments are the basis for DTR signatories and employee
                assignment.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="dept-name">Name</Label>
                <Input
                  id="dept-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., City Mayor's Office"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dept-code">Code</Label>
                <Input
                  id="dept-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="e.g., CMO"
                  className="uppercase"
                />
                <p className="text-xs text-muted-foreground">
                  A department whose name or code contains &quot;CMO&quot; prints
                  the City Mayor as the DTR signatory.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setDialogOpen(false);
                  resetForm();
                }}
              >
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {editing ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Department Head</TableHead>
              <TableHead className="text-center">Employees</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {departments.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-center text-muted-foreground py-8"
                >
                  No departments yet. Create one to get started.
                </TableCell>
              </TableRow>
            ) : (
              departments.map((dept) => (
                <TableRow key={dept.id}>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {dept.code}
                  </TableCell>
                  <TableCell className="font-medium">{dept.name}</TableCell>
                  <TableCell>
                    {dept.head_name ? (
                      dept.head_name
                    ) : (
                      <span className="text-muted-foreground">
                        Not assigned
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="outline" className="text-xs">
                      {dept.employee_count}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title="Set department head"
                        onClick={() => openHeadDialog(dept)}
                      >
                        <UserCog className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title="Edit department"
                        onClick={() => openEdit(dept)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="text-destructive hover:text-destructive"
                              title="Delete department"
                            />
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              Delete Department
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete &quot;{dept.name}
                              &quot;? This cannot be undone. Departments with
                              assigned employees or users cannot be deleted.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDelete(dept.id)}
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Set department head */}
      <Dialog open={headDialogOpen} onOpenChange={setHeadDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set Department Head</DialogTitle>
            <DialogDescription>
              {headDept
                ? `Choose the head of ${headDept.name}. The head signs subordinates' DTRs (City Administrator signs the head's own DTR).`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="dept-head">Department Head</Label>
            {loadingOptions ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading employees…
              </div>
            ) : (
              <Select
                value={selectedHead}
                items={[
                  { value: NO_HEAD, label: "No head" },
                  ...headOptions.map((e) => ({ value: e.id, label: e.name })),
                ]}
                onValueChange={(val) => setSelectedHead(val ?? NO_HEAD)}
              >
                <SelectTrigger id="dept-head" className="w-full">
                  <SelectValue placeholder="No head" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_HEAD}>No head</SelectItem>
                  {headOptions.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {!loadingOptions && headOptions.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No active employees belong to this department yet.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setHeadDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveHead} disabled={savingHead || loadingOptions}>
              {savingHead && <Loader2 className="h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
