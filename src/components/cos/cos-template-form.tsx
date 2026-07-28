"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CosRichTextEditor } from "@/components/cos/cos-rich-text-editor";
import {
  createCosContractTemplate,
  updateCosContractTemplate,
  type CosContractTemplate,
} from "@/lib/actions/cos-contract-template-actions";
import {
  cosContractTemplateFormSchema,
  type CosContractTemplateFormValues,
} from "@/lib/validations/cos-contract-schema";
import {
  asFormBody,
  EMPTY_CONTRACT_DOC,
  type TiptapNode,
} from "@/lib/cos-contract-doc";

interface CosTemplateFormProps {
  mode: "create" | "edit";
  template?: CosContractTemplate;
}

export function CosTemplateForm({ mode, template }: CosTemplateFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    setError,
    formState: { errors },
  } = useForm<CosContractTemplateFormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(cosContractTemplateFormSchema) as any,
    defaultValues: {
      name: template?.name ?? "",
      description: template?.description ?? null,
      is_active: template?.is_active ?? true,
      body: asFormBody<CosContractTemplateFormValues["body"]>(
        template?.body ?? EMPTY_CONTRACT_DOC,
      ),
    },
  });

  const watchBody = watch("body") as TiptapNode;
  const watchActive = watch("is_active");

  const onSubmit = async (values: CosContractTemplateFormValues) => {
    setLoading(true);
    const result =
      mode === "create"
        ? await createCosContractTemplate(values)
        : await updateCosContractTemplate(template!.id, values);
    setLoading(false);

    if ("error" in result) {
      // A duplicate name is a field problem, not a page-level failure.
      if ("field" in result && result.field === "name") {
        setError("name", { message: result.error });
      }
      toast.error(result.error);
      return;
    }

    toast.success(mode === "create" ? "Template created" : "Template updated");
    router.push("/cos/templates");
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Template Details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Template Name</Label>
            <Input id="name" {...register("name")} />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" rows={2} {...register("description")} />
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="is_active"
              checked={watchActive}
              onCheckedChange={(checked) =>
                setValue("is_active", checked, { shouldValidate: true })
              }
            />
            <Label htmlFor="is_active">Active</Label>
            <p className="text-sm text-muted-foreground">
              Inactive templates stay available to contracts already created
              from them, but drop out of the picker.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contract Body</CardTitle>
        </CardHeader>
        <CardContent>
          <CosRichTextEditor
            value={watchBody}
            onChange={(doc) =>
              setValue(
                "body",
                asFormBody<CosContractTemplateFormValues["body"]>(doc),
                { shouldValidate: true },
              )
            }
          />
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button type="submit" disabled={loading}>
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {mode === "create" ? "Create Template" : "Save Changes"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
