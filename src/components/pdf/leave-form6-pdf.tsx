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
  },

  // Top metadata strip (above the form box)
  topStrip: { flexDirection: "row", marginBottom: 4 },
  topLeft: { flex: 1 },
  topCenter: { flex: 2, flexDirection: "row", alignItems: "center", justifyContent: "center" },
  topRight: { flex: 1, alignItems: "flex-end" },
  formInfoItalic: { fontSize: 9, fontFamily: "Helvetica", fontStyle: "italic" },
  republic: { fontSize: 9, fontFamily: "Helvetica-Bold", textAlign: "center" },
  agencyName: { fontSize: 9, fontFamily: "Helvetica", fontStyle: "italic", textAlign: "center" },
  agencyAddr: { fontSize: 9, fontFamily: "Helvetica", fontStyle: "italic", textAlign: "center" },
  annex: { fontSize: 11, fontFamily: "Helvetica-Bold", letterSpacing: 1.5 },

  agencyTextWrap: { marginLeft: 6, alignItems: "center" },
  logo: { width: 56, height: 56 },

  // Page title row (logos | title | logos)
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginTop: -16,
    marginBottom: 6,
  },
  titleSideLogos: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
  },
  titleLogo: { width: 38, height: 38 },
  title: {
    flex: 1,
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    marginHorizontal: 12,
    marginTop: 14,
  },

  // Outer form box
  formBox: { border: BORDER },

  // Generic row helpers
  rowBordered: { flexDirection: "row", borderBottom: HAIR },
  rowOpen: { flexDirection: "row" },
  cellRightBorder: { borderRight: HAIR },

  cellLabel: { fontSize: 8.5 },
  cellLabelBold: { fontSize: 8.5, fontFamily: "Helvetica-Bold" },
  cellValue: { fontSize: 9, fontFamily: "Helvetica-Bold" },

  // Section banner: "6. DETAILS OF APPLICATION" / "7. DETAILS OF ACTION ON APPLICATION"
  sectionBanner: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    paddingVertical: 3,
    borderBottom: HAIR,
    backgroundColor: "#ffffff",
  },

  // Checkbox row
  cbRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: 1.5 },
  cbBox: {
    width: 8,
    height: 8,
    border: HAIR,
    marginTop: 1,
    marginRight: 4,
    justifyContent: "center",
    alignItems: "center",
  },
  cbLabel: { fontSize: 8.5, flex: 1, lineHeight: 1.2 },
  cbLabelMain: { fontFamily: "Helvetica" },
  cbLabelCite: { fontSize: 7.5 },

  italic: { fontFamily: "Helvetica", fontStyle: "italic" },

  // Underlines
  underline: { borderBottom: HAIR, flex: 1, minHeight: 10, marginLeft: 2 },

  // Table for 7.A
  ledger: { borderTop: HAIR, borderBottom: HAIR },
  ledgerHeader: { flexDirection: "row", borderBottom: HAIR },
  ledgerHCell: {
    fontSize: 8,
    paddingVertical: 2,
    paddingHorizontal: 3,
    textAlign: "center",
    fontFamily: "Helvetica-Bold",
  },
  ledgerRow: { flexDirection: "row", borderBottom: HAIR },
  ledgerRowLast: { flexDirection: "row" },
  ledgerLabelCell: {
    fontSize: 8,
    paddingVertical: 2,
    paddingHorizontal: 3,
    fontFamily: "Helvetica", fontStyle: "italic",
    borderRight: HAIR,
  },
  ledgerCell: {
    fontSize: 9,
    paddingVertical: 2,
    paddingHorizontal: 3,
    textAlign: "center",
    borderRight: HAIR,
  },
  ledgerCellLast: { fontSize: 9, paddingVertical: 2, paddingHorizontal: 3, textAlign: "center" },

  // Signature placement
  sigCenterLine: {
    borderBottom: HAIR,
    minHeight: 24,
    marginTop: 12,
    width: 200,
    alignSelf: "center",
  },
  sigCenterCaption: { fontSize: 8.5, textAlign: "center", marginTop: 2, fontFamily: "Helvetica", fontStyle: "italic" },
});

interface LeaveForm6PdfProps {
  employeeName: string;
  employeeNo: string;
  middleName: string;
  position: string;
  department: string;
  salaryGrade: number;
  dateOfFiling: string;
  leaveType: string;
  leaveTypeCode: string;
  startDate: string;
  endDate: string;
  daysApplied: number;
  reason: string | null;
  detailsOfLeave: string | null;
  commutationRequested: boolean;
  /** Days that consume leave credits (paid). The LWOP portion is `daysApplied - daysWithPay`. */
  daysWithPay: number;
  vlTotal: number;
  vlUsed: number;
  vlBalance: number;
  slTotal: number;
  slUsed: number;
  slBalance: number;
  leaveDates: string[];
  status: string;
  allLeaveTypeCodes: string[];
  /** Optional. Falls back to NEXT_PUBLIC_AGENCY_NAME or "(Agency Name)". */
  agencyName?: string;
  /** Optional. Falls back to NEXT_PUBLIC_AGENCY_ADDRESS. */
  agencyAddress?: string;
  /**
   * Pre-loaded logo as data URL or absolute URL. The caller should pre-fetch the
   * image and pass it here so PDF rendering never blocks on a network request
   * (and never silently fails). When omitted, the header renders without a logo.
   */
  logoSrc?: string;
  /**
   * Four logos rendered on either side of the "APPLICATION FOR LEAVE" title
   * (two on the left, two on the right). Pre-fetched as data URLs by the caller.
   * Any entry that's `undefined` is skipped so the slot stays empty.
   */
  titleLogos?: (string | undefined)[];
  /** Name printed above "(Authorized Officer)" under §7.A (leave-credits certifier). */
  signatory7A?: string;
  /** Position printed under the §7.A signatory's name (e.g. "HRMO"). */
  signatory7APosition?: string;
  /** Name printed above "(Authorized Officer)" under §7.B (recommending officer). */
  signatory7B?: string;
  /** Position printed under the §7.B signatory's name (e.g. "Department Head"). */
  signatory7BPosition?: string;
  /** Name printed above "(Authorized Official)" at the bottom (final approver). */
  signatoryFinal?: string;
  /** Position printed under the final approver's name (e.g. "City Mayor"). */
  signatoryFinalPosition?: string;
}

function fmtDate(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-PH", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function splitName(fullName: string, middle: string): {
  last: string;
  first: string;
  middle: string;
} {
  // The caller formats as "Last, First[ Middle]". Honor that.
  const [lastPart, rest] = fullName.split(",").map((p) => p.trim());
  if (!rest) return { last: fullName, first: "", middle: middle || "" };
  // rest may already contain middle name; prefer the explicit middleName prop if provided.
  if (middle) {
    const first = rest.replace(new RegExp(`\\s+${middle}\\s*$`), "").trim();
    return { last: lastPart ?? "", first, middle };
  }
  const tokens = rest.split(/\s+/);
  if (tokens.length >= 2) {
    return {
      last: lastPart ?? "",
      first: tokens.slice(0, -1).join(" "),
      middle: tokens[tokens.length - 1] ?? "",
    };
  }
  return { last: lastPart ?? "", first: rest, middle: "" };
}

function CB({ checked }: { checked: boolean }) {
  return (
    <View style={s.cbBox}>
      <Text style={{ fontSize: 6, textAlign: "center", lineHeight: 1 }}>
        {checked ? "X" : " "}
      </Text>
    </View>
  );
}

function CheckLine({
  checked,
  main,
  cite,
  trailing,
}: {
  checked: boolean;
  main: string;
  cite?: string;
  trailing?: string;
}) {
  return (
    <View style={s.cbRow}>
      <CB checked={checked} />
      <Text style={s.cbLabel}>
        <Text style={s.cbLabelMain}>{main}</Text>
        {cite ? <Text style={s.cbLabelCite}> {cite}</Text> : null}
        {trailing ? <Text> {trailing}</Text> : null}
      </Text>
    </View>
  );
}

function ValueLine({ children }: { children?: React.ReactNode }) {
  return (
    <Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold", borderBottom: HAIR, minHeight: 11, paddingBottom: 1 }}>
      {children ?? " "}
    </Text>
  );
}

export function LeaveForm6Pdf({
  employeeName,
  employeeNo: _employeeNo,
  middleName,
  position,
  department,
  salaryGrade,
  dateOfFiling,
  leaveType: _leaveType,
  leaveTypeCode,
  startDate,
  endDate,
  daysApplied,
  daysWithPay,
  reason: _reason,
  detailsOfLeave,
  commutationRequested,
  vlTotal,
  vlUsed: _vlUsed,
  vlBalance,
  slTotal,
  slUsed: _slUsed,
  slBalance,
  leaveDates,
  status,
  allLeaveTypeCodes: _allLeaveTypeCodes,
  agencyName,
  agencyAddress,
  logoSrc,
  titleLogos,
  signatory7A,
  signatory7APosition,
  signatory7B,
  signatory7BPosition,
  signatoryFinal,
  signatoryFinalPosition,
}: LeaveForm6PdfProps) {
  const isCode = (code: string) => leaveTypeCode === code;
  const { last, first, middle } = splitName(employeeName, middleName);

  const isWithinPH = detailsOfLeave === "Within the Philippines";
  const isAbroad = detailsOfLeave?.startsWith("Abroad") ?? false;
  const abroadSpec = isAbroad
    ? (detailsOfLeave ?? "").replace(/^Abroad:?\s*/i, "")
    : "";
  const isInHospital = detailsOfLeave?.startsWith("In Hospital") ?? false;
  const hospitalSpec = isInHospital
    ? (detailsOfLeave ?? "").replace(/^In Hospital:?\s*/i, "")
    : "";
  const isOutPatient = detailsOfLeave?.startsWith("Out Patient") ?? false;
  const outPatientSpec = isOutPatient
    ? (detailsOfLeave ?? "").replace(/^Out Patient:?\s*/i, "")
    : "";
  const selSpec = isCode("SEL") ? detailsOfLeave ?? "" : "";

  const inclusiveDates =
    leaveDates.length > 0
      ? leaveDates.length <= 5
        ? leaveDates.map(fmtDate).join(", ")
        : `${fmtDate(startDate)} to ${fmtDate(endDate)} (${leaveDates.length} dates)`
      : `${fmtDate(startDate)} to ${fmtDate(endDate)}`;

  // §7.A only certifies VL and SL credits. Any other leave type (FL, SPL, ML,
  // PL, …) leaves both "Less this application" cells blank — Total Earned and
  // Balance stay equal. Only the paid portion (daysWithPay) consumes credits;
  // the LWOP portion is shown separately under §7.C.
  const lessVl = isCode("VL") ? daysWithPay : 0;
  const lessSl = isCode("SL") ? daysWithPay : 0;
  const daysWithoutPay = Math.max(0, daysApplied - daysWithPay);
  // Trim float artifacts (e.g. 5.806999999) to at most 3 decimal places.
  const fmt3 = (n: number) =>
    n === 0 ? "" : parseFloat(n.toFixed(3)).toString();

  const resolvedAgencyName =
    agencyName ?? process.env.NEXT_PUBLIC_AGENCY_NAME ?? "Local Government Unit of Ozamiz City";
  const resolvedAgencyAddr =
    agencyAddress ?? process.env.NEXT_PUBLIC_AGENCY_ADDRESS ?? "City of Ozamiz";

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* Top strip: form no (left), agency block (center), ANNEX + receipt (right) */}
        <View style={s.topStrip}>
          <View style={s.topLeft}>
            <Text style={s.formInfoItalic}>Civil Service Form No. 6</Text>
            <Text style={s.formInfoItalic}>Revised 2020</Text>
          </View>
          <View style={s.topCenter}>
            {logoSrc ? (
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image src={logoSrc} style={s.logo} />
            ) : null}
            <View style={s.agencyTextWrap}>
              <Text style={s.republic}>Republic of the Philippines</Text>
              <Text style={s.agencyName}>{resolvedAgencyName}</Text>
              <Text style={s.agencyAddr}>{resolvedAgencyAddr}</Text>
            </View>
          </View>
          <View style={s.topRight}>
            <Text style={s.annex}>ANNEX A</Text>
          </View>
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
          <Text style={s.title}>APPLICATION FOR LEAVE</Text>
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

        {/* Form box */}
        <View style={s.formBox}>
          {/* Row: 1. OFFICE/DEPARTMENT  | 2. NAME (Last, First, Middle) */}
          <View style={s.rowBordered}>
            <View style={[{ width: "40%", padding: 4 }, s.cellRightBorder]}>
              <Text style={s.cellLabelBold}>1. OFFICE/DEPARTMENT</Text>
              <Text style={[s.cellValue, { marginTop: 8 }]}>{department || " "}</Text>
            </View>
            <View style={{ width: "60%", padding: 4 }}>
              <View style={{ flexDirection: "row" }}>
                <Text style={s.cellLabelBold}>2. NAME : </Text>
                <Text style={s.cellLabel}>(Last)</Text>
                <View style={{ flex: 1 }} />
                <Text style={s.cellLabel}>(First)</Text>
                <View style={{ flex: 1 }} />
                <Text style={s.cellLabel}>(Middle)</Text>
                <View style={{ flex: 0.4 }} />
              </View>
              <View style={{ flexDirection: "row", marginTop: 8 }}>
                <Text style={[s.cellValue, { flex: 1, borderBottom: HAIR, marginRight: 4 }]}>{last}</Text>
                <Text style={[s.cellValue, { flex: 1, borderBottom: HAIR, marginRight: 4 }]}>{first}</Text>
                <Text style={[s.cellValue, { flex: 1, borderBottom: HAIR }]}>{middle}</Text>
              </View>
            </View>
          </View>

          {/* Row: 3. DATE OF FILING | 4. POSITION | 5. SALARY */}
          <View style={s.rowBordered}>
            <View style={[{ width: "33.3%", padding: 4, flexDirection: "row" }, s.cellRightBorder]}>
              <Text style={s.cellLabelBold}>3. DATE OF FILING </Text>
              <Text style={[s.cellValue, { flex: 1, borderBottom: HAIR, marginLeft: 2 }]}>
                {dateOfFiling}
              </Text>
            </View>
            <View style={[{ width: "33.3%", padding: 4, flexDirection: "row" }, s.cellRightBorder]}>
              <Text style={s.cellLabelBold}>4. POSITION </Text>
              <Text style={[s.cellValue, { flex: 1, borderBottom: HAIR, marginLeft: 2 }]}>
                {position}
              </Text>
            </View>
            <View style={{ width: "33.4%", padding: 4, flexDirection: "row" }}>
              <Text style={s.cellLabelBold}>5. SALARY </Text>
              <Text style={[s.cellValue, { flex: 1, borderBottom: HAIR, marginLeft: 2 }]}>
                {salaryGrade ? `SG-${salaryGrade}` : ""}
              </Text>
            </View>
          </View>

          {/* Banner */}
          <Text style={s.sectionBanner}>6. DETAILS OF APPLICATION</Text>

          {/* 6.A | 6.B */}
          <View style={s.rowBordered}>
            {/* 6.A */}
            <View style={[{ width: "55%", padding: 4 }, s.cellRightBorder]}>
              <Text style={s.cellLabelBold}>6.A TYPE OF LEAVE TO BE AVAILED OF</Text>
              <View style={{ marginTop: 3 }}>
                <CheckLine
                  checked={isCode("VL")}
                  main="Vacation Leave"
                  cite="(Sec. 51, Rule XVI, Omnibus Rules Implementing E.O. No. 292)"
                />
                <CheckLine
                  checked={isCode("FL")}
                  main="Mandatory/Forced Leave"
                  cite="(Sec. 25, Rule XVI, Omnibus Rules Implementing E.O. No. 292)"
                />
                <CheckLine
                  checked={isCode("SL")}
                  main="Sick Leave"
                  cite="(Sec. 43, Rule XVI, Omnibus Rules Implementing E.O. No. 292)"
                />
                <CheckLine
                  checked={isCode("ML")}
                  main="Maternity Leave"
                  cite="(R.A. No. 11210 / IRR issued by CSC, DOLE and SSS)"
                />
                <CheckLine
                  checked={isCode("PL")}
                  main="Paternity Leave"
                  cite="(R.A. No. 8187 / CSC MC No. 71, s. 1998, as amended)"
                />
                <CheckLine
                  checked={isCode("SPL")}
                  main="Special Privilege Leave"
                  cite="(Sec. 21, Rule XVI, Omnibus Rules Implementing E.O. No. 292)"
                />
                <CheckLine
                  checked={isCode("SoloParent")}
                  main="Solo Parent Leave"
                  cite="(RA No. 8972 / CSC MC No. 8, s. 2004)"
                />
                <CheckLine
                  checked={false}
                  main="Study Leave"
                  cite="(Sec. 68, Rule XVI, Omnibus Rules Implementing E.O. No. 292)"
                />
                <CheckLine
                  checked={isCode("VAWC")}
                  main="10-Day VAWC Leave"
                  cite="(RA No. 9262 / CSC MC No. 15, s. 2005)"
                />
                <CheckLine
                  checked={isCode("RL")}
                  main="Rehabilitation Privilege"
                  cite="(Sec. 55, Rule XVI, Omnibus Rules Implementing E.O. No. 292)"
                />
                <CheckLine
                  checked={isCode("SEL")}
                  main="Special Leave Benefits for Women"
                  cite="(RA No. 9710 / CSC MC No. 25, s. 2010)"
                />
                <CheckLine
                  checked={isCode("CL")}
                  main="Special Emergency (Calamity) Leave"
                  cite="(CSC MC No. 2, s. 2012, as amended)"
                />
                <CheckLine
                  checked={isCode("AL")}
                  main="Adoption Leave"
                  cite="(R.A. No. 8552)"
                />
              </View>

              <Text style={[s.italic, { fontSize: 8.5, marginTop: 6 }]}>Others:</Text>
              <Text style={{ borderBottom: HAIR, minHeight: 11, marginTop: 4 }} />
            </View>

            {/* 6.B */}
            <View style={{ width: "45%", padding: 4 }}>
              <Text style={s.cellLabelBold}>6.B DETAILS OF LEAVE</Text>

              <Text style={[s.italic, { fontSize: 8.5, marginTop: 4 }]}>
                In case of Vacation/Special Privilege Leave:
              </Text>
              <View style={s.cbRow}>
                <CB checked={isWithinPH} />
                <Text style={s.cbLabel}>
                  Within the Philippines{" "}
                  <Text style={{ borderBottom: HAIR }}>
                    {isWithinPH ? "✓" : "                                          "}
                  </Text>
                </Text>
              </View>
              <View style={s.cbRow}>
                <CB checked={isAbroad} />
                <Text style={s.cbLabel}>
                  Abroad (Specify){" "}
                  <Text style={{ borderBottom: HAIR }}>
                    {abroadSpec || "                                          "}
                  </Text>
                </Text>
              </View>

              <Text style={[s.italic, { fontSize: 8.5, marginTop: 4 }]}>In case of Sick Leave:</Text>
              <View style={s.cbRow}>
                <CB checked={isInHospital} />
                <Text style={s.cbLabel}>
                  In Hospital (Specify Illness){" "}
                  <Text style={{ borderBottom: HAIR }}>
                    {hospitalSpec || "                                  "}
                  </Text>
                </Text>
              </View>
              <View style={s.cbRow}>
                <CB checked={isOutPatient} />
                <Text style={s.cbLabel}>
                  Out Patient (Specify Illness){" "}
                  <Text style={{ borderBottom: HAIR }}>
                    {outPatientSpec || "                                  "}
                  </Text>
                </Text>
              </View>

              <Text style={[s.italic, { fontSize: 8.5, marginTop: 4 }]}>
                In case of Special Leave Benefits for Women:
              </Text>
              <Text style={{ fontSize: 8.5, marginTop: 1 }}>
                (Specify Illness){" "}
                <Text style={{ borderBottom: HAIR }}>
                  {selSpec || "                                                              "}
                </Text>
              </Text>

              <Text style={[s.italic, { fontSize: 8.5, marginTop: 4 }]}>In case of Study Leave:</Text>
              <CheckLine checked={false} main="Completion of Master's Degree" />
              <CheckLine checked={false} main="BAR/Board Examination Review" />

              <Text style={[s.italic, { fontSize: 8.5, marginTop: 4 }]}>Other purpose:</Text>
              <CheckLine checked={false} main="Monetization of Leave Credits" />
              <CheckLine checked={false} main="Terminal Leave" />
            </View>
          </View>

          {/* 6.C | 6.D */}
          <View style={s.rowBordered}>
            <View style={[{ width: "55%", padding: 4 }, s.cellRightBorder]}>
              <Text style={s.cellLabelBold}>6.C NUMBER OF WORKING DAYS APPLIED FOR</Text>
              <ValueLine>{daysApplied ? `${daysApplied} day(s)` : ""}</ValueLine>
              <Text style={[s.cellLabelBold, { marginTop: 6 }]}>INCLUSIVE DATES</Text>
              <ValueLine>{inclusiveDates}</ValueLine>
            </View>
            <View style={{ width: "45%", padding: 4 }}>
              <Text style={s.cellLabelBold}>6.D COMMUTATION</Text>
              <View style={{ marginTop: 3 }}>
                <CheckLine checked={!commutationRequested} main="Not Requested" />
                <CheckLine checked={commutationRequested} main="Requested" />
              </View>
              <View style={{ marginTop: 22 }}>
                <Text style={{ borderBottom: HAIR, fontSize: 9, fontFamily: "Helvetica-Bold", textAlign: "center", minHeight: 11 }}>
                  {employeeName || " "}
                </Text>
                <Text style={[s.italic, { fontSize: 8.5, textAlign: "center", marginTop: 1 }]}>
                  (Signature of Applicant)
                </Text>
              </View>
            </View>
          </View>

          {/* Banner */}
          <Text style={s.sectionBanner}>7. DETAILS OF ACTION ON APPLICATION</Text>

          {/* 7.A | 7.B */}
          <View style={s.rowBordered}>
            {/* 7.A */}
            <View style={[{ width: "55%", padding: 4 }, s.cellRightBorder]}>
              <Text style={s.cellLabelBold}>7.A CERTIFICATION OF LEAVE CREDITS</Text>
              <View style={{ flexDirection: "row", marginTop: 3 }}>
                <Text style={[s.italic, { fontSize: 8.5 }]}>As of </Text>
                <Text style={{ flex: 1, borderBottom: HAIR, fontSize: 9, fontFamily: "Helvetica-Bold" }}>
                  {dateOfFiling}
                </Text>
              </View>

              <View style={{ marginTop: 6, ...s.ledger }}>
                <View style={s.ledgerHeader}>
                  <Text style={[s.ledgerHCell, { width: "33.3%", borderRight: HAIR }]}> </Text>
                  <Text style={[s.ledgerHCell, { width: "33.3%", borderRight: HAIR }]}>Vacation Leave</Text>
                  <Text style={[s.ledgerHCell, { width: "33.4%" }]}>Sick Leave</Text>
                </View>
                <View style={s.ledgerRow}>
                  <Text style={[s.ledgerLabelCell, { width: "33.3%" }]}>Total Earned</Text>
                  <Text style={[s.ledgerCell, { width: "33.3%" }]}>{fmt3(vlTotal)}</Text>
                  <Text style={[s.ledgerCellLast, { width: "33.4%" }]}>{fmt3(slTotal)}</Text>
                </View>
                <View style={s.ledgerRow}>
                  <Text style={[s.ledgerLabelCell, { width: "33.3%" }]}>Less this application</Text>
                  <Text style={[s.ledgerCell, { width: "33.3%" }]}>{fmt3(lessVl)}</Text>
                  <Text style={[s.ledgerCellLast, { width: "33.4%" }]}>{fmt3(lessSl)}</Text>
                </View>
                <View style={s.ledgerRowLast}>
                  <Text style={[s.ledgerLabelCell, { width: "33.3%" }]}>Balance</Text>
                  <Text style={[s.ledgerCell, { width: "33.3%", fontFamily: "Helvetica-Bold" }]}>
                    {fmt3(vlBalance)}
                  </Text>
                  <Text style={[s.ledgerCellLast, { width: "33.4%", fontFamily: "Helvetica-Bold" }]}>
                    {fmt3(slBalance)}
                  </Text>
                </View>
              </View>

              <View style={{ marginTop: 16 }}>
                <Text style={{ borderBottom: HAIR, width: "70%", alignSelf: "center", fontSize: 9, fontFamily: "Helvetica-Bold", textAlign: "center", minHeight: 11 }}>
                  {signatory7A || " "}
                </Text>
                {signatory7APosition ? (
                  <Text style={{ fontSize: 8.5, textAlign: "center", marginTop: 1 }}>
                    {signatory7APosition}
                  </Text>
                ) : null}
                <Text style={[s.italic, { fontSize: 8.5, textAlign: "center", marginTop: 1 }]}>
                  (Authorized Officer)
                </Text>
              </View>
            </View>

            {/* 7.B */}
            <View style={{ width: "45%", padding: 4 }}>
              <Text style={s.cellLabelBold}>7.B RECOMMENDATION</Text>
              <View style={{ marginTop: 3 }}>
                <CheckLine
                  checked={status === "approved" || status === "pending"}
                  main="For approval"
                />
                <View style={s.cbRow}>
                  <CB checked={status === "rejected"} />
                  <Text style={s.cbLabel}>
                    For disapproval due to{" "}
                    <Text style={{ borderBottom: HAIR }}>
                      {"                                                                  "}
                    </Text>
                  </Text>
                </View>
                <Text style={{ borderBottom: HAIR, marginTop: 2 }}> </Text>
                <Text style={{ borderBottom: HAIR, marginTop: 2 }}> </Text>
                <Text style={{ borderBottom: HAIR, marginTop: 2 }}> </Text>
              </View>

              <View style={{ marginTop: 14 }}>
                <Text style={{ borderBottom: HAIR, width: "70%", alignSelf: "center", fontSize: 9, fontFamily: "Helvetica-Bold", textAlign: "center", minHeight: 11 }}>
                  {signatory7B || " "}
                </Text>
                {signatory7BPosition ? (
                  <Text style={{ fontSize: 8.5, textAlign: "center", marginTop: 1 }}>
                    {signatory7BPosition}
                  </Text>
                ) : null}
                <Text style={[s.italic, { fontSize: 8.5, textAlign: "center", marginTop: 1 }]}>
                  (Authorized Officer)
                </Text>
              </View>
            </View>
          </View>

          {/* 7.C | 7.D */}
          <View style={s.rowBordered}>
            <View style={[{ width: "55%", padding: 4 }, s.cellRightBorder]}>
              <Text style={s.cellLabelBold}>7.C APPROVED FOR:</Text>
              <View style={{ flexDirection: "row", alignItems: "flex-end", marginTop: 4 }}>
                <Text style={{ borderBottom: HAIR, width: 50, fontSize: 9, fontFamily: "Helvetica-Bold", textAlign: "center" }}>
                  {status === "approved" ? fmt3(daysWithPay) : " "}
                </Text>
                <Text style={{ fontSize: 8.5, marginLeft: 4 }}>days with pay</Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "flex-end", marginTop: 4 }}>
                <Text style={{ borderBottom: HAIR, width: 50, fontSize: 9, fontFamily: "Helvetica-Bold", textAlign: "center" }}>
                  {status === "approved" && daysWithoutPay > 0 ? fmt3(daysWithoutPay) : " "}
                </Text>
                <Text style={{ fontSize: 8.5, marginLeft: 4 }}>days without pay</Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "flex-end", marginTop: 4 }}>
                <Text style={{ borderBottom: HAIR, width: 50 }}> </Text>
                <Text style={{ fontSize: 8.5, marginLeft: 4 }}>others (Specify)</Text>
              </View>
            </View>
            <View style={{ width: "45%", padding: 4 }}>
              <Text style={s.cellLabelBold}>7.D DISAPPROVED DUE TO:</Text>
              <Text style={{ borderBottom: HAIR, marginTop: 6 }}> </Text>
              <Text style={{ borderBottom: HAIR, marginTop: 4 }}> </Text>
              <Text style={{ borderBottom: HAIR, marginTop: 4 }}> </Text>
            </View>
          </View>

          {/* Final centered "Authorized Official" */}
          <View style={s.rowOpen}>
            <View style={{ width: "100%", padding: 6, paddingTop: 30, paddingBottom: 8 }}>
              <View style={s.sigCenterLine}>
                <Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold", textAlign: "center", marginTop: 8 }}>
                  {signatoryFinal || " "}
                </Text>
              </View>
              {signatoryFinalPosition ? (
                <Text style={{ fontSize: 8.5, textAlign: "center", marginTop: 1 }}>
                  {signatoryFinalPosition}
                </Text>
              ) : null}
              <Text style={s.sigCenterCaption}>(Authorized Official)</Text>
            </View>
          </View>
        </View>
      </Page>
    </Document>
  );
}
