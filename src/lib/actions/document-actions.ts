"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

export async function getDocuments(employeeId: string) {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .schema("hris")
    .from("documents")
    .select("*")
    .eq("employee_id", employeeId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}

export async function uploadDocument(formData: FormData) {
  const supabase = createAdminClient();

  const file = formData.get("file") as File;
  const employeeId = formData.get("employee_id") as string;
  const documentType = formData.get("document_type") as string;
  const uploadedBy = formData.get("uploaded_by") as string | null;

  if (!file || !employeeId || !documentType) {
    return { error: "Missing required fields." };
  }

  // Validate file size (10MB max)
  if (file.size > 10 * 1024 * 1024) {
    return { error: "File size must not exceed 10MB." };
  }

  // Validate file type
  const allowedTypes = [
    "application/pdf",
    "image/jpeg",
    "image/png",
  ];
  if (!allowedTypes.includes(file.type)) {
    return { error: "Only PDF, JPG, and PNG files are allowed." };
  }

  // Upload to Supabase Storage
  const fileExt = file.name.split(".").pop();
  const fileName = `${employeeId}/${Date.now()}-${crypto.randomUUID()}.${fileExt}`;

  const { error: uploadError } = await supabase.storage
    .from("201-files")
    .upload(fileName, file);

  if (uploadError) {
    return { error: `Upload failed: ${uploadError.message}` };
  }

  // Get public URL
  const { data: urlData } = supabase.storage
    .from("201-files")
    .getPublicUrl(fileName);

  // Insert document record
  const { data, error } = await supabase
    .schema("hris")
    .from("documents")
    .insert({
      employee_id: employeeId,
      file_name: file.name,
      file_url: urlData.publicUrl,
      file_size: file.size,
      mime_type: file.type,
      type: documentType,
      uploaded_by: uploadedBy,
    })
    .select()
    .single();

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/employees/${employeeId}`);
  return { data };
}

export async function deleteDocument(documentId: string, employeeId: string) {
  const supabase = createAdminClient();

  // Get the document to find the storage path
  const { data: doc } = await supabase
    .schema("hris")
    .from("documents")
    .select("file_url")
    .eq("id", documentId)
    .single();

  if (doc?.file_url) {
    // Extract path from URL and delete from storage
    const url = new URL(doc.file_url);
    const pathParts = url.pathname.split("/storage/v1/object/public/201-files/");
    if (pathParts.length > 1) {
      await supabase.storage.from("201-files").remove([pathParts[1]]);
    }
  }

  // Delete document record
  const { error } = await supabase
    .schema("hris")
    .from("documents")
    .delete()
    .eq("id", documentId);

  if (error) return { error: error.message };

  revalidatePath(`/employees/${employeeId}`);
  return { success: true };
}

export async function generateServiceRecordPdf(employeeId: string) {
  const supabase = createAdminClient();

  // Get employee data
  const { data: employee, error: empError } = await supabase
    .schema("hris")
    .from("employees")
    .select("*, departments!employees_department_id_fkey(name, code), positions(title)")
    .eq("id", employeeId)
    .single();

  if (empError || !employee) {
    return { error: "Employee not found." };
  }

  // Create/update service record from current employment data
  const { data: existingRecords } = await supabase
    .schema("hris")
    .from("service_records")
    .select("id")
    .eq("employee_id", employeeId)
    .is("date_to", null)
    .limit(1);

  const serviceRecordData = {
    employee_id: employeeId,
    date_from: employee.hire_date,
    date_to: employee.end_of_contract ?? null,
    designation: employee.positions?.title ?? "Staff",
    status_type: employee.employment_type,
    salary: null as number | null,
    office: employee.departments?.name ?? null,
    remarks: null,
  };

  // Look up salary from salary_grade_table
  const { data: salaryData } = await supabase
    .schema("hris")
    .from("salary_grade_table")
    .select("amount")
    .eq("grade", employee.salary_grade)
    .eq("step", employee.step_increment)
    .order("effective_year", { ascending: false })
    .limit(1);

  if (salaryData && salaryData.length > 0) {
    serviceRecordData.salary = salaryData[0].amount;
  }

  if (existingRecords && existingRecords.length > 0) {
    await supabase
      .schema("hris")
      .from("service_records")
      .update(serviceRecordData)
      .eq("id", existingRecords[0].id);
  } else {
    await supabase
      .schema("hris")
      .from("service_records")
      .insert(serviceRecordData);
  }

  revalidatePath(`/employees/${employeeId}`);
  return { success: true };
}
