import { z } from "zod";

const optionalText = z
  .string()
  .nullable()
  .transform((v) => (v && v.trim() !== "" ? v.trim() : null));

const optionalNumber = z
  .union([z.string(), z.number(), z.null()])
  .transform((v) => {
    if (v === null || v === "" || v === undefined) return null;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  });

const optionalInt = z
  .union([z.string(), z.number(), z.null()])
  .transform((v) => {
    if (v === null || v === "" || v === undefined) return null;
    const n = typeof v === "number" ? v : parseInt(String(v), 10);
    return Number.isFinite(n) ? n : null;
  });

export const serviceRecordFormSchema = z
  .object({
    date_from: z.string().min(1, "Date from is required"),
    date_to: z.string().nullable(),
    designation: z.string().min(1, "Designation is required").max(200),
    status_type: optionalText,
    salary: optionalNumber,
    salary_grade: optionalInt.refine(
      (v) => v === null || (v >= 1 && v <= 33),
      "Salary grade must be between 1 and 33"
    ),
    step_increment: optionalInt.refine(
      (v) => v === null || (v >= 1 && v <= 8),
      "Step must be between 1 and 8"
    ),
    office: optionalText,
    branch: optionalText,
    agency: optionalText,
    leave_without_pay: z
      .union([z.string(), z.number()])
      .transform((v) => {
        const n = typeof v === "number" ? v : parseInt(String(v || "0"), 10);
        return Number.isFinite(n) && n >= 0 ? n : 0;
      }),
    daily_salary: optionalNumber,
    separation_date: z.string().nullable(),
    separation_cause: optionalText,
    remarks: optionalText,
  })
  .refine(
    (data) => {
      if (!data.date_to) return true;
      return new Date(data.date_to) >= new Date(data.date_from);
    },
    { message: "Date to must be on or after date from", path: ["date_to"] }
  );

export type ServiceRecordFormValues = z.infer<typeof serviceRecordFormSchema>;
export type ServiceRecordFormInput = z.input<typeof serviceRecordFormSchema>;
