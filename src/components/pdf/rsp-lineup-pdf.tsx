import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 9, fontFamily: "Helvetica" },
  header: { textAlign: "center", marginBottom: 4 },
  subtitle: { fontSize: 9, marginBottom: 2 },
  lgu: { fontSize: 11, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  formTitle: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    marginTop: 10,
    marginBottom: 2,
  },
  formSubtitle: {
    fontSize: 9,
    textAlign: "center",
    color: "#444",
    marginBottom: 12,
  },
  meta: { flexDirection: "row", flexWrap: "wrap", marginBottom: 10 },
  metaItem: { width: "50%", marginBottom: 3 },
  metaLabel: { fontFamily: "Helvetica-Bold" },
  table: { border: "1pt solid #000" },
  headRow: {
    flexDirection: "row",
    borderBottom: "1pt solid #000",
    backgroundColor: "#f0f0f0",
    fontFamily: "Helvetica-Bold",
  },
  row: { flexDirection: "row", borderBottom: "0.5pt solid #000" },
  rowLast: { flexDirection: "row" },
  cellRank: {
    width: 34,
    padding: 4,
    textAlign: "center",
    borderRight: "0.5pt solid #000",
  },
  cellName: { width: 160, padding: 4, borderRight: "0.5pt solid #000" },
  cellScore: {
    flex: 1,
    padding: 4,
    textAlign: "center",
    borderRight: "0.5pt solid #000",
  },
  cellTotal: { width: 60, padding: 4, textAlign: "center", fontFamily: "Helvetica-Bold" },
  signatures: {
    marginTop: 36,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-around",
  },
  signatureBlock: { width: "28%", textAlign: "center", marginBottom: 18 },
  signatureLine: {
    borderTop: "1pt solid #000",
    marginTop: 30,
    paddingTop: 3,
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
  },
  signatureTitle: { fontSize: 8, color: "#444" },
  note: { fontSize: 7, color: "#666", marginTop: 14, fontStyle: "italic" },
});

function formatDate(dateStr: string | null) {
  if (!dateStr) return "—";
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-PH", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export interface LineupCriterion {
  id: string;
  name: string;
  weight: number;
}

export interface LineupCandidate {
  rank: number;
  name: string;
  criterionScores: Record<string, number | null>;
  total: number;
  incomplete: boolean;
}

export interface LineupSignatory {
  name: string;
  position: string;
}

export interface RspLineupPdfProps {
  lguName: string;
  lguAddress: string;
  positionTitle: string;
  itemNumber: string;
  organizationalUnit: string | null;
  salaryGrade: number | null;
  publicationDate: string | null;
  closingDate: string | null;
  deliberationDate: string | null;
  criteria: LineupCriterion[];
  candidates: LineupCandidate[];
  signatories: LineupSignatory[];
}

export function RspLineupPdf(props: RspLineupPdfProps) {
  const signatories =
    props.signatories.length > 0
      ? props.signatories
      : [
          { name: "", position: "HRMPSB Chairperson" },
          { name: "", position: "HRMPSB Member" },
          { name: "", position: "HRMPSB Member" },
        ];

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.subtitle}>Republic of the Philippines</Text>
          <Text style={styles.lgu}>{props.lguName}</Text>
          {props.lguAddress ? (
            <Text style={styles.subtitle}>{props.lguAddress}</Text>
          ) : null}
        </View>

        <Text style={styles.formTitle}>
          COMPARATIVE ASSESSMENT RESULT / SELECTION LINEUP
        </Text>
        <Text style={styles.formSubtitle}>
          Human Resource Merit Promotion and Selection Board (HRMPSB)
        </Text>

        <View style={styles.meta}>
          <Text style={styles.metaItem}>
            <Text style={styles.metaLabel}>Position: </Text>
            {props.positionTitle}
          </Text>
          <Text style={styles.metaItem}>
            <Text style={styles.metaLabel}>Item No.: </Text>
            {props.itemNumber}
          </Text>
          <Text style={styles.metaItem}>
            <Text style={styles.metaLabel}>Office: </Text>
            {props.organizationalUnit ?? "—"}
          </Text>
          <Text style={styles.metaItem}>
            <Text style={styles.metaLabel}>Salary Grade: </Text>
            {props.salaryGrade != null ? `SG ${props.salaryGrade}` : "—"}
          </Text>
          <Text style={styles.metaItem}>
            <Text style={styles.metaLabel}>Publication Period: </Text>
            {formatDate(props.publicationDate)} — {formatDate(props.closingDate)}
          </Text>
          <Text style={styles.metaItem}>
            <Text style={styles.metaLabel}>Date of HRMPSB Deliberation: </Text>
            {formatDate(props.deliberationDate)}
          </Text>
        </View>

        <View style={styles.table}>
          <View style={styles.headRow}>
            <Text style={styles.cellRank}>Rank</Text>
            <Text style={styles.cellName}>Candidate</Text>
            {props.criteria.map((c) => (
              <Text key={c.id} style={styles.cellScore}>
                {c.name} ({Number(c.weight)}%)
              </Text>
            ))}
            <Text style={styles.cellTotal}>Total</Text>
          </View>
          {props.candidates.map((cand, i) => (
            <View
              key={`${cand.rank}-${cand.name}`}
              style={i === props.candidates.length - 1 ? styles.rowLast : styles.row}
            >
              <Text style={styles.cellRank}>{cand.rank}</Text>
              <Text style={styles.cellName}>
                {cand.name}
                {cand.incomplete ? " *" : ""}
              </Text>
              {props.criteria.map((c) => (
                <Text key={c.id} style={styles.cellScore}>
                  {cand.criterionScores[c.id] != null
                    ? cand.criterionScores[c.id]?.toFixed(2)
                    : "—"}
                </Text>
              ))}
              <Text style={styles.cellTotal}>{cand.total.toFixed(2)}</Text>
            </View>
          ))}
        </View>

        {props.candidates.some((c) => c.incomplete) && (
          <Text style={styles.note}>
            * Candidate has one or more criteria without a recorded score
            (counted as zero).
          </Text>
        )}

        <View style={styles.signatures}>
          {signatories.map((s, i) => (
            <View key={i} style={styles.signatureBlock}>
              <Text style={styles.signatureLine}>{s.name || " "}</Text>
              <Text style={styles.signatureTitle}>{s.position}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.note}>
          Certified correct per deliberation of the HRMPSB. Pursuant to the
          2017 ORAOHRA, the appointing officer/authority may appoint any
          candidate in the selection lineup.
        </Text>
      </Page>
    </Document>
  );
}
