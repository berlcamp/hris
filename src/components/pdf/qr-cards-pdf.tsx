import { Document, Page, StyleSheet, Text, View, Image } from "@react-pdf/renderer";

import { idText } from "@/lib/id-text";

/**
 * Printable QR ID cards, 10 to an A4 sheet.
 *
 * Geometry is in points, @react-pdf's default unit (1pt = 1/72in). A card is
 * the standard ID size, 85.6 x 54 mm:
 *   85.6mm = 85.6 / 25.4 * 72 = 242.6pt
 *   54.0mm = 54.0 / 25.4 * 72 = 153.1pt
 * Two across and five down fills 485.2 x 765.4pt inside A4's 595.3 x 841.9,
 * leaving even margins to cut into.
 *
 * There is no photo on these cards because there is no employee photo anywhere
 * in this database. The card is therefore a BEARER credential: whoever holds it
 * scans as that person. That is why reissue rotates the token (see
 * rotateQrCredential) and why the scanner shows the holder's name back to the
 * officer, who is the only check that the card matches the face.
 */
const CARD_W = 242.6;
const CARD_H = 153.1;
const QR_SIZE = 74; // ~26mm — big enough for a phone to lock on at arm's length.

export interface QrCardPrintItem {
  full_name: string;
  /** employee_no / cos_no. Null for Job Order, which has no number at all. */
  id_number: string | null;
  group_name: string | null;
  employment_label: string;
  token: string;
  /** PNG data URL, rendered by the caller with `qrcode`. */
  qrDataUrl: string;
}

const styles = StyleSheet.create({
  page: {
    paddingTop: 38,
    paddingBottom: 38,
    paddingHorizontal: 55,
    backgroundColor: "#ffffff",
  },
  row: { flexDirection: "row" },
  card: {
    width: CARD_W,
    height: CARD_H,
    borderWidth: 0.5,
    borderColor: "#94a3b8",
    borderStyle: "dashed",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
  },
  details: { flex: 1, paddingRight: 8 },
  org: {
    fontSize: 6.5,
    letterSpacing: 0.8,
    color: "#64748b",
    marginBottom: 4,
  },
  name: { fontSize: 11, fontFamily: "Helvetica-Bold", lineHeight: 1.15 },
  meta: { fontSize: 7.5, color: "#334155", marginTop: 3 },
  label: {
    fontSize: 6.5,
    fontFamily: "Helvetica-Bold",
    color: "#0f172a",
    marginTop: 5,
    letterSpacing: 0.5,
  },
  qrWrap: { alignItems: "center" },
  qr: { width: QR_SIZE, height: QR_SIZE },
  code: { fontSize: 6, color: "#64748b", marginTop: 3, letterSpacing: 0.5 },
});

/**
 * What a human reads back over the phone when the camera will not cooperate.
 * Job Order personnel have no employee number of any kind in their registry, so
 * the card falls back to the tail of the token — every card carries something.
 */
export function cardCode(item: Pick<QrCardPrintItem, "id_number" | "token">): string {
  // idText rather than a bare .trim(): these id columns are not reliably text
  // in the production database, and a throw here takes down the print screen.
  return idText(item.id_number) ?? item.token.slice(-6);
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export function QrCardsPdf({
  cards,
  organizationName,
}: {
  cards: QrCardPrintItem[];
  organizationName: string;
}) {
  const pages = chunk(cards, 10);

  return (
    <Document>
      {pages.map((pageCards, pageIndex) => (
        <Page key={pageIndex} size="A4" style={styles.page}>
          {chunk(pageCards, 2).map((rowCards, rowIndex) => (
            <View key={rowIndex} style={styles.row}>
              {rowCards.map((card) => (
                <View key={card.token} style={styles.card}>
                  <View style={styles.details}>
                    <Text style={styles.org}>{organizationName.toUpperCase()}</Text>
                    <Text style={styles.name}>{card.full_name}</Text>
                    {card.group_name ? (
                      <Text style={styles.meta}>{card.group_name}</Text>
                    ) : null}
                    <Text style={styles.label}>
                      {card.employment_label.toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.qrWrap}>
                    {/* eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf Image takes no alt */}
                    <Image style={styles.qr} src={card.qrDataUrl} />
                    <Text style={styles.code}>{cardCode(card)}</Text>
                  </View>
                </View>
              ))}
            </View>
          ))}
        </Page>
      ))}
    </Document>
  );
}
