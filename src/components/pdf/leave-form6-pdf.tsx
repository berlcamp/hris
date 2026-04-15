import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";

const s = StyleSheet.create({
  page: { padding: 30, fontSize: 8, fontFamily: "Helvetica" },
  // Header
  formNo: { fontSize: 7, textAlign: "left", marginBottom: 1 },
  header: { textAlign: "center", marginBottom: 6 },
  republic: { fontSize: 8, marginBottom: 1 },
  agency: { fontSize: 8, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  title: { fontSize: 13, fontFamily: "Helvetica-Bold", letterSpacing: 2, marginBottom: 4 },
  // Outer box
  box: { border: "1pt solid #000" },
  // Rows
  row: { flexDirection: "row", borderBottom: "0.5pt solid #000", minHeight: 18 },
  rowLast: { flexDirection: "row", minHeight: 18 },
  // Cells
  cellLabel: { fontSize: 7, color: "#333" },
  cellValue: { fontSize: 9, fontFamily: "Helvetica-Bold" },
  // Section headers
  sectionHeader: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    backgroundColor: "#ddd",
    padding: 3,
    borderBottom: "0.5pt solid #000",
    textAlign: "center",
  },
  // Checkbox
  cb: { fontSize: 8 },
  cbChecked: { fontSize: 8, fontFamily: "Helvetica-Bold" },
  // Signature
  sigLine: { borderTop: "1pt solid #000", marginTop: 30, paddingTop: 2, fontSize: 7, textAlign: "center" },
  sigName: { fontSize: 8, fontFamily: "Helvetica-Bold", textAlign: "center", marginTop: 1 },
  sigTitle: { fontSize: 7, textAlign: "center", color: "#555" },
});

function Checkbox({ checked, label }: { checked: boolean; label: string }) {
  return (
    <Text style={checked ? s.cbChecked : s.cb}>
      {checked ? "[X] " : "[  ] "}
      {label}
    </Text>
  );
}

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
  vlTotal: number;
  vlUsed: number;
  vlBalance: number;
  slTotal: number;
  slUsed: number;
  slBalance: number;
  leaveDates: string[];
  status: string;
  allLeaveTypeCodes: string[];
}

function fmtDate(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-PH", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function LeaveForm6Pdf({
  employeeName,
  employeeNo,
  middleName,
  position,
  department,
  salaryGrade,
  dateOfFiling,
  leaveType,
  leaveTypeCode,
  startDate,
  endDate,
  daysApplied,
  reason,
  detailsOfLeave,
  commutationRequested,
  vlTotal,
  vlUsed,
  vlBalance,
  slTotal,
  slUsed,
  slBalance,
  leaveDates,
  status,
  allLeaveTypeCodes,
}: LeaveForm6PdfProps) {
  const isCode = (code: string) => leaveTypeCode === code;

  // Parse details
  const isWithinPH = detailsOfLeave === "Within the Philippines";
  const isAbroad = detailsOfLeave?.startsWith("Abroad") ?? false;
  const abroadSpec = isAbroad ? detailsOfLeave?.replace("Abroad: ", "").replace("Abroad", "") : "";
  const isInHospital = detailsOfLeave?.startsWith("In Hospital") ?? false;
  const hospitalSpec = isInHospital ? detailsOfLeave?.replace("In Hospital: ", "").replace("In Hospital", "") : "";
  const isOutPatient = detailsOfLeave?.startsWith("Out Patient") ?? false;
  const outPatientSpec = isOutPatient ? detailsOfLeave?.replace("Out Patient: ", "").replace("Out Patient", "") : "";

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* Form number */}
        <Text style={s.formNo}>Civil Service Form No. 6</Text>
        <Text style={s.formNo}>Revised 2020</Text>

        {/* Header */}
        <View style={s.header}>
          <Text style={s.republic}>Republic of the Philippines</Text>
          <Text style={s.agency}>{department || "___________________"}</Text>
        </View>
        <View style={{ textAlign: "center", marginBottom: 8 }}>
          <Text style={s.title}>APPLICATION FOR LEAVE</Text>
        </View>

        {/* Top info row: 1-5 */}
        <View style={s.box}>
          <View style={s.row}>
            <View style={{ width: "40%", padding: 4, borderRight: "0.5pt solid #000" }}>
              <Text style={s.cellLabel}>1. OFFICE/DEPARTMENT</Text>
              <Text style={s.cellValue}>{department}</Text>
            </View>
            <View style={{ width: "35%", padding: 4, borderRight: "0.5pt solid #000" }}>
              <Text style={s.cellLabel}>2. NAME (Last, First, Middle)</Text>
              <Text style={s.cellValue}>{employeeName}</Text>
            </View>
            <View style={{ width: "25%", padding: 4 }}>
              <Text style={s.cellLabel}>DATE OF FILING</Text>
              <Text style={s.cellValue}>{dateOfFiling}</Text>
            </View>
          </View>
          <View style={s.rowLast}>
            <View style={{ width: "40%", padding: 4, borderRight: "0.5pt solid #000" }}>
              <Text style={s.cellLabel}>3. SALARY</Text>
              <Text style={s.cellValue}>SG-{salaryGrade}</Text>
            </View>
            <View style={{ width: "35%", padding: 4, borderRight: "0.5pt solid #000" }}>
              <Text style={s.cellLabel}>4. POSITION</Text>
              <Text style={s.cellValue}>{position}</Text>
            </View>
            <View style={{ width: "25%", padding: 4 }}>
              <Text style={s.cellLabel}>5. EMPLOYEE NO.</Text>
              <Text style={s.cellValue}>{employeeNo}</Text>
            </View>
          </View>
        </View>

        {/* Section 6 */}
        <View style={{ ...s.box, marginTop: 6 }}>
          <Text style={s.sectionHeader}>6. DETAILS OF APPLICATION</Text>

          <View style={s.row}>
            {/* 6.A - Left column */}
            <View style={{ width: "50%", padding: 4, borderRight: "0.5pt solid #000" }}>
              <Text style={{ ...s.cellLabel, fontFamily: "Helvetica-Bold", marginBottom: 3 }}>
                6.A TYPE OF LEAVE TO BE AVAILED OF
              </Text>
              <Checkbox checked={isCode("VL")} label="Vacation Leave (Sec. 51, Rule XVI, Omnibus Rules Implementing E.O. No. 292)" />
              <Checkbox checked={isCode("FL")} label="Mandatory/Forced Leave (Sec. 25, Rule XVI, Omnibus Rules)" />
              <Checkbox checked={isCode("SL")} label="Sick Leave (Sec. 43, Rule XVI, Omnibus Rules)" />
              <Checkbox checked={isCode("ML")} label="Maternity Leave (R.A. No. 11210 / IRR issued by CSC, DOLE, SSS)" />
              <Checkbox checked={isCode("PL")} label="Paternity Leave (R.A. No. 8187 / CSC MC No. 71, s. 1998)" />
              <Checkbox checked={isCode("SPL")} label="Special Privilege Leave (Sec. 21, Rule XVI, Omnibus Rules)" />
              <Checkbox checked={isCode("SoloParent")} label="Solo Parent Leave (R.A. No. 8972 / CSC MC No. 8, s. 2004)" />
              <Checkbox checked={isCode("VAWC")} label="10-Day VAWC Leave (R.A. No. 9262 / CSC MC No. 15, s. 2005)" />
              <Checkbox checked={isCode("RL")} label="Rehabilitation Privilege (Sec. 55, Rule XVI, Omnibus Rules)" />
              <Checkbox checked={isCode("CL")} label="Special Emergency (Calamity) Leave (CSC MC No. 2, s. 2012)" />
              <Checkbox checked={isCode("AL")} label="Adoption Leave (R.A. No. 8552)" />
              <Checkbox checked={isCode("SEL")} label="Special Leave Benefits for Women (R.A. No. 9710)" />
            </View>

            {/* 6.B - Right column */}
            <View style={{ width: "50%", padding: 4 }}>
              <Text style={{ ...s.cellLabel, fontFamily: "Helvetica-Bold", marginBottom: 3 }}>
                6.B DETAILS OF LEAVE
              </Text>

              <Text style={{ ...s.cellLabel, marginBottom: 2, marginTop: 2 }}>
                In case of Vacation/Special Privilege Leave:
              </Text>
              <Checkbox checked={isWithinPH} label="Within the Philippines" />
              <Checkbox checked={isAbroad} label={`Abroad (Specify) ${abroadSpec || "___________"}`} />

              <Text style={{ ...s.cellLabel, marginBottom: 2, marginTop: 6 }}>
                In case of Sick Leave:
              </Text>
              <Checkbox checked={isInHospital} label={`In Hospital (Specify Illness) ${hospitalSpec || "___________"}`} />
              <Checkbox checked={isOutPatient} label={`Out Patient (Specify Illness) ${outPatientSpec || "___________"}`} />

              <Text style={{ ...s.cellLabel, marginBottom: 2, marginTop: 6 }}>
                In case of Special Leave Benefits for Women:
              </Text>
              <Text style={s.cb}>
                (Specify Illness) {isCode("SEL") ? detailsOfLeave || "___________" : "___________"}
              </Text>

              <Text style={{ ...s.cellLabel, marginBottom: 2, marginTop: 6 }}>
                In case of Study Leave:
              </Text>
              <Checkbox checked={false} label="Completion of Master's Degree" />
              <Checkbox checked={false} label="BAR/Board Examination Review" />

              <Text style={{ ...s.cellLabel, marginBottom: 2, marginTop: 6 }}>
                Other purpose/Leave:
              </Text>
              <Checkbox checked={false} label="Monetization of Leave Credits" />
              <Checkbox checked={false} label="Terminal Leave" />
            </View>
          </View>

          {/* 6.C */}
          <View style={s.row}>
            <View style={{ width: "50%", padding: 4, borderRight: "0.5pt solid #000" }}>
              <Text style={s.cellLabel}>6.C NUMBER OF WORKING DAYS APPLIED FOR</Text>
              <Text style={{ ...s.cellValue, fontSize: 10, marginTop: 2 }}>{daysApplied} day(s)</Text>
              <Text style={{ ...s.cellLabel, marginTop: 3 }}>INCLUSIVE DATES</Text>
              <Text style={{ ...s.cellValue, marginTop: 1 }}>
                {leaveDates.length > 0
                  ? leaveDates.length <= 5
                    ? leaveDates.map((d) => fmtDate(d)).join(", ")
                    : `${fmtDate(startDate)} to ${fmtDate(endDate)} (${leaveDates.length} specific dates)`
                  : `${fmtDate(startDate)} to ${fmtDate(endDate)}`}
              </Text>
            </View>
            <View style={{ width: "50%", padding: 4 }}>
              <Text style={s.cellLabel}>6.D COMMUTATION</Text>
              <View style={{ marginTop: 3 }}>
                <Checkbox checked={!commutationRequested} label="Not Requested" />
                <Checkbox checked={commutationRequested} label="Requested" />
              </View>
            </View>
          </View>

          {/* Reason */}
          {reason && (
            <View style={s.rowLast}>
              <View style={{ padding: 4, width: "100%" }}>
                <Text style={s.cellLabel}>REMARKS</Text>
                <Text style={{ ...s.cellValue, marginTop: 2 }}>{reason}</Text>
              </View>
            </View>
          )}
        </View>

        {/* Applicant signature */}
        <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 4, marginBottom: 4 }}>
          <View style={{ width: "40%" }}>
            <Text style={s.sigLine}>Signature of Applicant</Text>
          </View>
        </View>

        {/* Section 7 */}
        <View style={{ ...s.box, marginTop: 2 }}>
          <Text style={s.sectionHeader}>7. DETAILS OF ACTION ON APPLICATION</Text>

          {/* 7.A Certification of Leave Credits */}
          <View style={s.row}>
            <View style={{ width: "100%", padding: 4 }}>
              <Text style={{ ...s.cellLabel, fontFamily: "Helvetica-Bold", marginBottom: 3 }}>
                7.A CERTIFICATION OF LEAVE CREDITS
              </Text>
              <Text style={{ ...s.cellLabel, marginBottom: 4 }}>
                As of filing of application, the leave credits balance of the applicant are as follows:
              </Text>
              {/* Credit table header */}
              <View style={{ flexDirection: "row", borderTop: "0.5pt solid #000", borderBottom: "0.5pt solid #000", backgroundColor: "#f0f0f0" }}>
                <Text style={{ width: "25%", padding: 2, fontSize: 7, fontFamily: "Helvetica-Bold", textAlign: "center", borderRight: "0.5pt solid #000" }}> </Text>
                <Text style={{ width: "25%", padding: 2, fontSize: 7, fontFamily: "Helvetica-Bold", textAlign: "center", borderRight: "0.5pt solid #000" }}>Total Earned</Text>
                <Text style={{ width: "25%", padding: 2, fontSize: 7, fontFamily: "Helvetica-Bold", textAlign: "center", borderRight: "0.5pt solid #000" }}>Less this application</Text>
                <Text style={{ width: "25%", padding: 2, fontSize: 7, fontFamily: "Helvetica-Bold", textAlign: "center" }}>Balance</Text>
              </View>
              {/* VL row */}
              <View style={{ flexDirection: "row", borderBottom: "0.5pt solid #000" }}>
                <Text style={{ width: "25%", padding: 2, fontSize: 7, borderRight: "0.5pt solid #000" }}>Vacation Leave</Text>
                <Text style={{ width: "25%", padding: 2, fontSize: 8, textAlign: "center", borderRight: "0.5pt solid #000" }}>{vlTotal}</Text>
                <Text style={{ width: "25%", padding: 2, fontSize: 8, textAlign: "center", borderRight: "0.5pt solid #000" }}>
                  {isCode("VL") || isCode("FL") || isCode("SPL") ? daysApplied : ""}
                </Text>
                <Text style={{ width: "25%", padding: 2, fontSize: 8, textAlign: "center", fontFamily: "Helvetica-Bold" }}>{vlBalance}</Text>
              </View>
              {/* SL row */}
              <View style={{ flexDirection: "row" }}>
                <Text style={{ width: "25%", padding: 2, fontSize: 7, borderRight: "0.5pt solid #000" }}>Sick Leave</Text>
                <Text style={{ width: "25%", padding: 2, fontSize: 8, textAlign: "center", borderRight: "0.5pt solid #000" }}>{slTotal}</Text>
                <Text style={{ width: "25%", padding: 2, fontSize: 8, textAlign: "center", borderRight: "0.5pt solid #000" }}>
                  {isCode("SL") ? daysApplied : ""}
                </Text>
                <Text style={{ width: "25%", padding: 2, fontSize: 8, textAlign: "center", fontFamily: "Helvetica-Bold" }}>{slBalance}</Text>
              </View>
            </View>
          </View>

          {/* 7.B Recommendation */}
          <View style={s.row}>
            <View style={{ width: "50%", padding: 4, borderRight: "0.5pt solid #000" }}>
              <Text style={{ ...s.cellLabel, fontFamily: "Helvetica-Bold", marginBottom: 3 }}>
                7.B RECOMMENDATION
              </Text>
              <Checkbox checked={status === "approved" || status === "pending"} label="For approval" />
              <Checkbox checked={status === "rejected"} label="For disapproval due to:" />
              <Text style={{ fontSize: 7, marginTop: 2 }}>________________________</Text>
            </View>
            <View style={{ width: "50%", padding: 4 }}>
              <Text style={{ ...s.cellLabel, fontFamily: "Helvetica-Bold", marginBottom: 3 }}>
                7.C APPROVED FOR
              </Text>
              <Text style={s.cb}>
                {status === "approved" ? `${daysApplied} days with pay` : "_______ days with pay"}
              </Text>
              <Text style={{ ...s.cb, marginTop: 2 }}>_______ days without pay</Text>
              <Text style={{ ...s.cellLabel, fontFamily: "Helvetica-Bold", marginTop: 6, marginBottom: 2 }}>
                DISAPPROVED DUE TO:
              </Text>
              <Text style={{ fontSize: 7 }}>________________________</Text>
            </View>
          </View>
        </View>

        {/* Signatures */}
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
          <View style={{ width: "45%" }}>
            <Text style={s.sigLine}>Department Head / Authorized Representative</Text>
            <Text style={s.sigTitle}>Recommending Approval</Text>
          </View>
          <View style={{ width: "45%" }}>
            <Text style={s.sigLine}>Authorized Official</Text>
            <Text style={s.sigTitle}>Approved / Disapproved</Text>
          </View>
        </View>

        {/* Footer */}
        <Text style={{ fontSize: 6, color: "#999", textAlign: "center", marginTop: 15, fontStyle: "italic" }}>
          CS Form No. 6 (Revised 2020) - Application for Leave
        </Text>
      </Page>
    </Document>
  );
}
