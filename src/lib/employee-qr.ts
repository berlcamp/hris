import * as QRCode from "qrcode";

// Public QR target for an employee record. Scanning the printed/rendered QR
// opens the employee's page on the public HRIS site. The domain is fixed by the
// deployment (hris.asensoozamiz.com) and the path carries the employee UUID.
const EMPLOYEE_QR_BASE_URL = "https://hris.asensoozamiz.com";

export function buildEmployeeQrUrl(employeeId: string): string {
  return `${EMPLOYEE_QR_BASE_URL}/employee/${employeeId}`;
}

/** Render the employee QR as a PNG data URL (safe to embed in <img src>). */
export async function generateEmployeeQrDataUrl(
  employeeId: string,
): Promise<string> {
  return QRCode.toDataURL(buildEmployeeQrUrl(employeeId), {
    width: 512,
    margin: 1,
    errorCorrectionLevel: "M",
  });
}
