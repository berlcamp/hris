import QRCode from "qrcode";

/**
 * How the attendance-card QR is rendered, everywhere it is rendered.
 *
 * Shared rather than repeated because the two call sites must agree: a card
 * printed from /events/cards and the same card shown on an employee's profile
 * encode the same token, and a difference in size or error correction would
 * make one of them scan worse than the other for no reason anybody could see.
 *
 * High error correction is not decoration — these cards live in wallets and get
 * creased, and a crease through a QR at level M takes the code with it.
 */
export const QR_CARD_IMAGE_OPTIONS = {
  width: 512,
  margin: 1,
  errorCorrectionLevel: "H",
} as const;

/** The card QR as a PNG data URL, safe to embed in an `<img>` or a PDF `<Image>`. */
export function generateQrCardDataUrl(token: string): Promise<string> {
  return QRCode.toDataURL(token, QR_CARD_IMAGE_OPTIONS);
}
