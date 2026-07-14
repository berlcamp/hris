import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
} from "@react-pdf/renderer";

const HAIR = "0.7pt solid #000";

const s = StyleSheet.create({
  page: {
    paddingTop: 28,
    paddingBottom: 24,
    paddingHorizontal: 40,
    fontSize: 10,
    fontFamily: "Helvetica",
    flexDirection: "column",
  },

  topStrip: { flexDirection: "row", marginBottom: 4 },
  topLeft: { flex: 1 },
  topCenter: { flex: 2, flexDirection: "row", alignItems: "center", justifyContent: "center" },
  topRight: { flex: 1, alignItems: "flex-end" },
  formInfoItalic: { fontSize: 8.5, fontFamily: "Helvetica", fontStyle: "italic" },
  republic: { fontSize: 9, fontFamily: "Helvetica-Bold", textAlign: "center" },
  agencyName: { fontSize: 9, fontFamily: "Helvetica", fontStyle: "italic", textAlign: "center" },
  agencyAddr: { fontSize: 9, fontFamily: "Helvetica", fontStyle: "italic", textAlign: "center" },
  agencyTextWrap: { marginLeft: 6, alignItems: "center" },

  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginTop: 4,
    marginBottom: 14,
  },
  titleSideLogos: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  titleLogo: { width: 38, height: 38 },
  title: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    marginHorizontal: 12,
    marginTop: 8,
  },

  body: { fontSize: 10, lineHeight: 1.6, textAlign: "justify", marginBottom: 10 },
  bold: { fontFamily: "Helvetica-Bold" },

  table: { border: HAIR, marginVertical: 8 },
  tHeader: { flexDirection: "row", borderBottom: HAIR, backgroundColor: "#eeeeee" },
  tRow: { flexDirection: "row", borderBottom: HAIR },
  tRowLast: { flexDirection: "row" },
  tHCell: {
    fontSize: 8.5,
    fontFamily: "Helvetica-Bold",
    paddingVertical: 3,
    paddingHorizontal: 4,
    textAlign: "center",
    borderRight: HAIR,
  },
  tCell: {
    fontSize: 9,
    paddingVertical: 3,
    paddingHorizontal: 4,
    textAlign: "center",
    borderRight: HAIR,
  },
  noRight: { borderRight: undefined },

  totalRow: { flexDirection: "row", borderTop: HAIR },
  totalLabel: {
    flex: 5,
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    paddingVertical: 3,
    paddingHorizontal: 4,
    textAlign: "right",
    borderRight: HAIR,
  },

  fine: { fontSize: 8, lineHeight: 1.4, marginTop: 8, fontFamily: "Helvetica", fontStyle: "italic" },

  sigRow: { flexDirection: "row", marginTop: 36 },
  sigBlock: { flex: 1, alignItems: "center", paddingHorizontal: 16 },
  sigLine: { borderBottom: HAIR, minHeight: 20, width: "100%" },
  sigName: { fontSize: 10, fontFamily: "Helvetica-Bold", textAlign: "center", marginTop: 3 },
  sigCaption: { fontSize: 8.5, textAlign: "center", marginTop: 1, fontFamily: "Helvetica", fontStyle: "italic" },
});

export interface CocCertificateEntry {
  ot_date: string;
  day_type: string;
  hours_worked: number;
  multiplier: number;
  hours_earned: number;
  expiry_date: string;
  office_order_no: string | null;
}

export interface CocCertificatePdfProps {
  employeeName: string;
  position: string;
  department: string;
  entries: CocCertificateEntry[];
  totalEarned: number;
  availableBalance: number;
  issuedDate: string;
  agencyName?: string;
  agencyAddress?: string;
  titleLogos?: (string | undefined)[];
  signatoryHr?: string;
  signatoryHrPosition?: string;
  signatoryHead?: string;
  signatoryHeadPosition?: string;
}

const dayTypeLabel: Record<string, string> = {
  regular: "Regular",
  rest_day: "Rest day",
  holiday: "Holiday",
};

function fmtDate(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function CocCertificatePdf({
  employeeName,
  position,
  department,
  entries,
  totalEarned,
  availableBalance,
  issuedDate,
  agencyName,
  agencyAddress,
  titleLogos,
  signatoryHr,
  signatoryHrPosition,
  signatoryHead,
  signatoryHeadPosition,
}: CocCertificatePdfProps) {
  const resolvedAgencyName =
    agencyName ?? process.env.NEXT_PUBLIC_AGENCY_NAME ?? "Local Government Unit of Ozamiz City";
  const resolvedAgencyAddr =
    agencyAddress ?? process.env.NEXT_PUBLIC_AGENCY_ADDRESS ?? "City of Ozamiz";

  return (
    <Document>
      <Page size="LETTER" style={s.page}>
        <View style={s.topStrip}>
          <View style={s.topLeft}>
            <Text style={s.formInfoItalic}>CSC-DBM Joint Circular No. 2, s. 2004</Text>
          </View>
          <View style={s.topCenter}>
            <View style={s.agencyTextWrap}>
              <Text style={s.republic}>Republic of the Philippines</Text>
              <Text style={s.agencyName}>{resolvedAgencyName}</Text>
              <Text style={s.agencyAddr}>{resolvedAgencyAddr}</Text>
            </View>
          </View>
          <View style={s.topRight} />
        </View>

        <View style={s.titleRow}>
          <View style={s.titleSideLogos}>
            {titleLogos?.[0] ? (
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image src={titleLogos[0]} style={s.titleLogo} />
            ) : null}
            {titleLogos?.[1] ? (
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image src={titleLogos[1]} style={s.titleLogo} />
            ) : null}
          </View>
          <Text style={s.title}>
            CERTIFICATE OF COMPENSATORY OVERTIME CREDITS EARNED
          </Text>
          <View style={s.titleSideLogos}>
            {titleLogos?.[2] ? (
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image src={titleLogos[2]} style={s.titleLogo} />
            ) : null}
            {titleLogos?.[3] ? (
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image src={titleLogos[3]} style={s.titleLogo} />
            ) : null}
          </View>
        </View>

        <Text style={s.body}>
          This is to certify that <Text style={s.bold}>{employeeName}</Text>
          {position ? (
            <Text>
              , <Text style={s.bold}>{position}</Text>
            </Text>
          ) : null}
          {department ? (
            <Text>
              {" "}of the <Text style={s.bold}>{department}</Text>
            </Text>
          ) : null}
          , has earned a total of{" "}
          <Text style={s.bold}>{totalEarned} hour(s)</Text> of Compensatory
          Overtime Credits (COC) for authorized overtime services rendered, as
          itemized below, of which{" "}
          <Text style={s.bold}>{availableBalance} hour(s)</Text> remain
          available as of {issuedDate}.
        </Text>

        <View style={s.table}>
          <View style={s.tHeader}>
            <Text style={[s.tHCell, { flex: 1.3 }]}>Date of Overtime</Text>
            <Text style={[s.tHCell, { flex: 1 }]}>Day Type</Text>
            <Text style={[s.tHCell, { flex: 1 }]}>Hours Rendered</Text>
            <Text style={[s.tHCell, { flex: 0.8 }]}>Multiplier</Text>
            <Text style={[s.tHCell, { flex: 1 }]}>COC Earned</Text>
            <Text style={[s.tHCell, { flex: 1.3 }]}>Valid Until</Text>
            <Text style={[s.tHCell, { flex: 1.4 }, s.noRight]}>Authority</Text>
          </View>
          {entries.map((e, i) => (
            <View
              key={`${e.ot_date}-${i}`}
              style={i === entries.length - 1 ? s.tRowLast : s.tRow}
            >
              <Text style={[s.tCell, { flex: 1.3 }]}>{fmtDate(e.ot_date)}</Text>
              <Text style={[s.tCell, { flex: 1 }]}>
                {dayTypeLabel[e.day_type] ?? e.day_type}
              </Text>
              <Text style={[s.tCell, { flex: 1 }]}>{e.hours_worked}</Text>
              <Text style={[s.tCell, { flex: 0.8 }]}>×{e.multiplier}</Text>
              <Text style={[s.tCell, { flex: 1 }]}>{e.hours_earned}</Text>
              <Text style={[s.tCell, { flex: 1.3 }]}>{fmtDate(e.expiry_date)}</Text>
              <Text style={[s.tCell, { flex: 1.4 }, s.noRight]}>
                {e.office_order_no ?? "—"}
              </Text>
            </View>
          ))}
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>TOTAL COC EARNED</Text>
            <Text style={[s.tCell, { flex: 1 }, s.bold]}>{totalEarned}</Text>
            <Text style={[s.tCell, { flex: 2.7 }, s.noRight]}> </Text>
          </View>
        </View>

        <Text style={s.fine}>
          Pursuant to CSC-DBM Joint Circular No. 2, s. 2004, Compensatory
          Overtime Credits are valid for one (1) year from the date the overtime
          was rendered, may be accumulated up to a maximum of one hundred twenty
          (120) hours, are not convertible to cash, may not be used to offset
          tardiness or undertime, and are forfeited upon separation from the
          service.
        </Text>

        <Text style={[s.body, { marginTop: 16 }]}>
          Issued this {issuedDate} for whatever legal purpose it may serve.
        </Text>

        <View style={s.sigRow}>
          <View style={s.sigBlock}>
            <View style={s.sigLine} />
            <Text style={s.sigName}>{signatoryHr || " "}</Text>
            <Text style={s.sigCaption}>
              {signatoryHrPosition || "(Human Resource Management Officer)"}
            </Text>
          </View>
          <View style={s.sigBlock}>
            <View style={s.sigLine} />
            <Text style={s.sigName}>{signatoryHead || " "}</Text>
            <Text style={s.sigCaption}>
              {signatoryHeadPosition || "(Agency Head / Authorized Official)"}
            </Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}
