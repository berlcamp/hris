import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
} from "@react-pdf/renderer";

const BORDER = "1pt solid #000";
const HAIR = "0.7pt solid #000";

const s = StyleSheet.create({
  page: {
    paddingTop: 24,
    paddingBottom: 18,
    paddingHorizontal: 22,
    fontSize: 9,
    fontFamily: "Helvetica",
    flexDirection: "column",
  },

  topStrip: { flexDirection: "row", marginBottom: 4 },
  topLeft: { flex: 1 },
  topCenter: { flex: 2, flexDirection: "row", alignItems: "center", justifyContent: "center" },
  topRight: { flex: 1, alignItems: "flex-end" },
  formInfoItalic: { fontSize: 9, fontFamily: "Helvetica", fontStyle: "italic" },
  republic: { fontSize: 9, fontFamily: "Helvetica-Bold", textAlign: "center" },
  agencyName: { fontSize: 9, fontFamily: "Helvetica", fontStyle: "italic", textAlign: "center" },
  agencyAddr: { fontSize: 9, fontFamily: "Helvetica", fontStyle: "italic", textAlign: "center" },
  agencyTextWrap: { marginLeft: 6, alignItems: "center" },

  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginTop: 2,
    marginBottom: 8,
  },
  titleSideLogos: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  titleLogo: { width: 38, height: 38 },
  title: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    marginHorizontal: 12,
    marginTop: 10,
  },

  formBox: { border: BORDER },
  rowBordered: { flexDirection: "row", borderBottom: HAIR },
  cellRightBorder: { borderRight: HAIR },
  cell: { paddingVertical: 4, paddingHorizontal: 6 },
  cellLabel: { fontSize: 7.5 },
  cellValue: { fontSize: 9.5, fontFamily: "Helvetica-Bold", marginTop: 1 },

  sectionBanner: {
    fontSize: 9.5,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    paddingVertical: 3,
    borderBottom: HAIR,
  },

  fine: { fontSize: 7.5, lineHeight: 1.35 },

  sigRow: { flexDirection: "row", marginTop: 4 },
  sigBlock: { flex: 1, paddingVertical: 8, paddingHorizontal: 10, alignItems: "center" },
  sigLine: { borderBottom: HAIR, minHeight: 22, width: "90%" },
  sigName: { fontSize: 9.5, fontFamily: "Helvetica-Bold", textAlign: "center", marginTop: 2 },
  sigCaption: { fontSize: 8, textAlign: "center", marginTop: 1, fontFamily: "Helvetica", fontStyle: "italic" },
  sigDate: { fontSize: 7.5, textAlign: "center", marginTop: 1 },
});

export interface CtoApplicationPdfProps {
  employeeName: string;
  position: string;
  department: string;
  dateOfFiling: string;
  ctoDates: string[];
  startDate: string;
  endDate: string;
  hoursApplied: number;
  reason: string | null;
  status: string;
  /** Available COC balance (hours) at print time; null hides the row. */
  availableBalance: number | null;
  deptApprovedAt: string | null;
  hrApprovedAt: string | null;
  agencyName?: string;
  agencyAddress?: string;
  titleLogos?: (string | undefined)[];
  signatoryDeptHead?: string;
  signatoryDeptHeadPosition?: string;
  signatoryFinal?: string;
  signatoryFinalPosition?: string;
}

function fmtDate(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-PH", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleDateString("en-PH", {
    timeZone: "Asia/Manila",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function CtoApplicationPdf({
  employeeName,
  position,
  department,
  dateOfFiling,
  ctoDates,
  startDate,
  endDate,
  hoursApplied,
  reason,
  status,
  availableBalance,
  deptApprovedAt,
  hrApprovedAt,
  agencyName,
  agencyAddress,
  titleLogos,
  signatoryDeptHead,
  signatoryDeptHeadPosition,
  signatoryFinal,
  signatoryFinalPosition,
}: CtoApplicationPdfProps) {
  const resolvedAgencyName =
    agencyName ?? process.env.NEXT_PUBLIC_AGENCY_NAME ?? "Local Government Unit of Ozamiz City";
  const resolvedAgencyAddr =
    agencyAddress ?? process.env.NEXT_PUBLIC_AGENCY_ADDRESS ?? "City of Ozamiz";

  const inclusiveDates =
    ctoDates.length > 0
      ? ctoDates.map(fmtDate).join(", ")
      : `${fmtDate(startDate)} to ${fmtDate(endDate)}`;
  const equivalentDays = hoursApplied / 8;
  const balanceAfter =
    availableBalance !== null
      ? status === "approved"
        ? availableBalance
        : availableBalance - hoursApplied
      : null;

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
          <Text style={s.title}>APPLICATION FOR COMPENSATORY TIME-OFF (CTO)</Text>
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

        <View style={s.formBox}>
          {/* Employee block */}
          <View style={s.rowBordered}>
            <View style={[s.cell, s.cellRightBorder, { flex: 2 }]}>
              <Text style={s.cellLabel}>NAME (Last, First, Middle)</Text>
              <Text style={s.cellValue}>{employeeName}</Text>
            </View>
            <View style={[s.cell, { flex: 1 }]}>
              <Text style={s.cellLabel}>DATE OF FILING</Text>
              <Text style={s.cellValue}>{dateOfFiling}</Text>
            </View>
          </View>
          <View style={s.rowBordered}>
            <View style={[s.cell, s.cellRightBorder, { flex: 2 }]}>
              <Text style={s.cellLabel}>OFFICE / DEPARTMENT</Text>
              <Text style={s.cellValue}>{department || " "}</Text>
            </View>
            <View style={[s.cell, { flex: 1 }]}>
              <Text style={s.cellLabel}>POSITION</Text>
              <Text style={s.cellValue}>{position || " "}</Text>
            </View>
          </View>

          <Text style={s.sectionBanner}>DETAILS OF AVAILMENT</Text>

          <View style={s.rowBordered}>
            <View style={[s.cell, { flex: 1 }]}>
              <Text style={s.cellLabel}>INCLUSIVE DATES</Text>
              <Text style={s.cellValue}>{inclusiveDates}</Text>
            </View>
          </View>
          <View style={s.rowBordered}>
            <View style={[s.cell, s.cellRightBorder, { flex: 1 }]}>
              <Text style={s.cellLabel}>HOURS APPLIED FOR</Text>
              <Text style={s.cellValue}>
                {hoursApplied} hour(s) — {equivalentDays} working day(s)
              </Text>
            </View>
            <View style={[s.cell, s.cellRightBorder, { flex: 1 }]}>
              <Text style={s.cellLabel}>COC BALANCE (before)</Text>
              <Text style={s.cellValue}>
                {availableBalance !== null
                  ? `${status === "approved" ? availableBalance + hoursApplied : availableBalance} hour(s)`
                  : "—"}
              </Text>
            </View>
            <View style={[s.cell, { flex: 1 }]}>
              <Text style={s.cellLabel}>COC BALANCE (after)</Text>
              <Text style={s.cellValue}>
                {balanceAfter !== null ? `${balanceAfter} hour(s)` : "—"}
              </Text>
            </View>
          </View>
          <View style={s.rowBordered}>
            <View style={[s.cell, { flex: 1 }]}>
              <Text style={s.cellLabel}>REASON / REMARKS</Text>
              <Text style={s.cellValue}>{reason || " "}</Text>
            </View>
          </View>

          <Text style={s.sectionBanner}>SIGNATORIES</Text>

          <View style={s.sigRow}>
            <View style={s.sigBlock}>
              <View style={s.sigLine} />
              <Text style={s.sigName}>{employeeName}</Text>
              <Text style={s.sigCaption}>(Applicant)</Text>
              <Text style={s.sigDate}>Date: {dateOfFiling}</Text>
            </View>
            <View style={s.sigBlock}>
              <View style={s.sigLine} />
              <Text style={s.sigName}>{signatoryDeptHead || " "}</Text>
              <Text style={s.sigCaption}>
                {signatoryDeptHeadPosition || "(Department Head)"}
              </Text>
              <Text style={s.sigDate}>
                {deptApprovedAt ? `Approved: ${fmtDateTime(deptApprovedAt)}` : "Date: ______________"}
              </Text>
            </View>
            <View style={s.sigBlock}>
              <View style={s.sigLine} />
              <Text style={s.sigName}>{signatoryFinal || " "}</Text>
              <Text style={s.sigCaption}>
                {signatoryFinalPosition || "(Authorized Official)"}
              </Text>
              <Text style={s.sigDate}>
                {hrApprovedAt ? `Approved: ${fmtDateTime(hrApprovedAt)}` : "Date: ______________"}
              </Text>
            </View>
          </View>

          <View style={[s.cell, { borderTop: HAIR }]}>
            <Text style={s.fine}>
              Conditions per CSC-DBM Joint Circular No. 2, s. 2004: (1) CTO may be
              availed of in blocks of four (4) or eight (8) hours, for up to five
              (5) consecutive working days per application; (2) Compensatory
              Overtime Credits (COC) are non-cumulative beyond 120 hours, expire
              one (1) year from the date the overtime was rendered, and are not
              convertible to cash; (3) COCs cannot be used to offset tardiness or
              undertime; (4) the employee is considered on full-time paid status
              while on CTO.
            </Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}
