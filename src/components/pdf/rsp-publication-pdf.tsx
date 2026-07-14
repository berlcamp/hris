import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: { padding: 50, fontSize: 10, fontFamily: "Helvetica" },
  header: { textAlign: "center", marginBottom: 6 },
  subtitle: { fontSize: 10, marginBottom: 2 },
  lgu: { fontSize: 12, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  formTitle: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    marginTop: 14,
    marginBottom: 4,
    textDecoration: "underline",
  },
  legalBasis: {
    fontSize: 8,
    textAlign: "center",
    color: "#444",
    marginBottom: 16,
  },
  intro: { marginBottom: 12, lineHeight: 1.4 },
  table: { border: "1pt solid #000", marginBottom: 14 },
  tableRow: { flexDirection: "row", borderBottom: "0.5pt solid #000" },
  tableRowLast: { flexDirection: "row" },
  cellLabel: {
    width: 150,
    padding: 6,
    fontFamily: "Helvetica-Bold",
    borderRight: "0.5pt solid #000",
    backgroundColor: "#f0f0f0",
  },
  cellValue: { flex: 1, padding: 6 },
  sectionTitle: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    marginBottom: 6,
  },
  note: { fontSize: 9, lineHeight: 1.4, marginBottom: 4 },
  signatureSection: {
    marginTop: 40,
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  signatureBlock: { width: "40%", textAlign: "center" },
  signatureLine: {
    borderTop: "1pt solid #000",
    marginTop: 36,
    paddingTop: 4,
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
  },
  signatureTitle: { fontSize: 8, color: "#444" },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 50,
    right: 50,
    fontSize: 7,
    color: "#666",
    textAlign: "center",
    fontStyle: "italic",
  },
});

function formatDate(dateStr: string | null) {
  if (!dateStr) return "—";
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-PH", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export interface RspPublicationPdfProps {
  lguName: string;
  lguAddress: string;
  positionTitle: string;
  itemNumber: string;
  organizationalUnit: string | null;
  placeOfAssignment: string | null;
  salaryGrade: number | null;
  monthlySalary: number | null;
  qsEducation: string | null;
  qsTraining: string | null;
  qsTrainingHours: number | null;
  qsExperience: string | null;
  qsExperienceYears: number | null;
  qsEligibility: string | null;
  publicationDate: string | null;
  closingDate: string | null;
  cscBulletinNo: string | null;
}

export function RspPublicationPdf(props: RspPublicationPdfProps) {
  const training =
    props.qsTraining ??
    (props.qsTrainingHours != null ? `${props.qsTrainingHours} hours` : "None required");
  const experience =
    props.qsExperience ??
    (props.qsExperienceYears != null
      ? `${props.qsExperienceYears} year(s)`
      : "None required");

  const rows: { label: string; value: string }[] = [
    { label: "Position Title", value: props.positionTitle },
    { label: "Plantilla Item No.", value: props.itemNumber },
    { label: "Office / Unit", value: props.organizationalUnit ?? "—" },
    { label: "Place of Assignment", value: props.placeOfAssignment ?? "—" },
    {
      label: "Salary Grade",
      value: props.salaryGrade != null ? `SG ${props.salaryGrade}` : "—",
    },
    {
      label: "Monthly Salary",
      value:
        props.monthlySalary != null
          ? `PHP ${Number(props.monthlySalary).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`
          : "—",
    },
    { label: "Education", value: props.qsEducation ?? "—" },
    { label: "Training", value: training },
    { label: "Experience", value: experience },
    { label: "Eligibility", value: props.qsEligibility ?? "—" },
  ];

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.subtitle}>Republic of the Philippines</Text>
          <Text style={styles.lgu}>{props.lguName}</Text>
          {props.lguAddress ? (
            <Text style={styles.subtitle}>{props.lguAddress}</Text>
          ) : null}
        </View>

        <Text style={styles.formTitle}>PUBLICATION OF VACANT POSITION</Text>
        <Text style={styles.legalBasis}>
          Pursuant to Republic Act No. 7041 and the 2017 Omnibus Rules on
          Appointments and Other Human Resource Actions (ORAOHRA)
          {props.cscBulletinNo
            ? ` — CSC Bulletin of Vacant Positions No. ${props.cscBulletinNo}`
            : ""}
        </Text>

        <Text style={styles.intro}>
          Notice is hereby given that the following position is vacant and open
          to all qualified applicants, without regard to age, sex, civil
          status, disability, religion, ethnicity, or political affiliation:
        </Text>

        <View style={styles.table}>
          {rows.map((row, i) => (
            <View
              key={row.label}
              style={i === rows.length - 1 ? styles.tableRowLast : styles.tableRow}
            >
              <Text style={styles.cellLabel}>{row.label}</Text>
              <Text style={styles.cellValue}>{row.value}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.sectionTitle}>How to Apply</Text>
        <Text style={styles.note}>
          Interested and qualified applicants should submit a signed
          application letter addressed to the Local Chief Executive, together
          with a fully accomplished Personal Data Sheet (CS Form No. 212,
          Revised 2017), a certified true copy of the certificate of
          eligibility/rating/license, certified true copies of transcript of
          records and diploma, and certificates of relevant training and work
          experience, to the Human Resource Management Office.
        </Text>
        <Text style={styles.note}>
          Date of Posting: {formatDate(props.publicationDate)}
        </Text>
        <Text style={[styles.note, { fontFamily: "Helvetica-Bold" }]}>
          Deadline of Submission: {formatDate(props.closingDate)}
        </Text>

        <View style={styles.signatureSection}>
          <View style={styles.signatureBlock}>
            <Text style={styles.signatureLine}> </Text>
            <Text style={styles.signatureTitle}>
              Human Resource Management Officer
            </Text>
          </View>
        </View>

        <Text style={styles.footer}>
          Posted in at least three (3) conspicuous places for a minimum of ten
          (10) calendar days pursuant to RA 7041. This publication is valid for
          nine (9) months from the date of posting.
        </Text>
      </Page>
    </Document>
  );
}
