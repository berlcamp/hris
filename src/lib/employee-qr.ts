import * as QRCode from "qrcode";

// Public QR target for an employee record. Scanning the printed/rendered QR
// opens the employee's page on the public site. The domain is fixed by the
// deployment (aoadmin.sortbrite.com) and the path carries the employee's
// human-assigned ID number (hris.employees.id_number), not the internal UUID.
const EMPLOYEE_QR_BASE_URL = "http://aoadmin.sortbrite.com";

export function buildEmployeeQrUrl(idNumber: string): string {
  return `${EMPLOYEE_QR_BASE_URL}/employee/${idNumber}`;
}

/** Render the employee QR as a PNG data URL (safe to embed in <img src>). */
export async function generateEmployeeQrDataUrl(
  idNumber: string,
): Promise<string> {
  return QRCode.toDataURL(buildEmployeeQrUrl(idNumber), {
    width: 512,
    margin: 1,
    errorCorrectionLevel: "M",
  });
}
