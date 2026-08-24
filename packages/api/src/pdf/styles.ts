import { StyleSheet } from "@react-pdf/renderer";

export const styles = StyleSheet.create({
  page: {
    padding: 32,
    fontSize: 10,
    fontFamily: "PTSans",
    color: "#1a1a1a",
  },
  title: {
    fontSize: 15,
    fontFamily: "PTSans",
    fontWeight: "bold",
    marginBottom: 3,
  },
  subtitle: {
    fontSize: 9,
    color: "#555555",
    marginBottom: 12,
  },
  section: {
    marginBottom: 9,
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: "PTSans",
    fontWeight: "bold",
    marginBottom: 4,
    borderBottom: "1px solid #cccccc",
    paddingBottom: 2,
  },
  row: {
    flexDirection: "row",
    marginBottom: 3,
  },
  label: {
    width: 130,
    color: "#555555",
  },
  value: {
    flex: 1,
  },
  photoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 6,
  },
  photoCard: {
    width: 220,
    marginBottom: 10,
  },
  photoImage: {
    width: 220,
    height: 150,
    objectFit: "cover",
    marginBottom: 4,
  },
  photoLabel: {
    fontFamily: "PTSans",
    fontWeight: "bold",
    fontSize: 9,
    marginBottom: 2,
  },
  photoDamage: {
    fontSize: 8,
    color: "#333333",
  },
  signatureBlock: {
    marginTop: 24,
  },
  signatureImage: {
    width: 200,
    height: 80,
    marginTop: 6,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    borderBottom: "1px solid #cccccc",
    paddingBottom: 8,
    marginBottom: 8,
  },
  companyHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  logo: {
    width: 44,
    height: 44,
    objectFit: "contain",
  },
  companyBlock: {
    maxWidth: 320,
  },
  companyName: {
    fontSize: 13,
    fontFamily: "PTSans",
    fontWeight: "bold",
    marginBottom: 2,
  },
  companyLine: {
    fontSize: 8,
    color: "#444444",
  },
  contractNumberBox: {
    border: "1px solid #1a1a1a",
    borderRadius: 4,
    padding: 8,
    minWidth: 160,
    alignItems: "center",
  },
  contractNumberLabel: {
    fontSize: 8,
    color: "#555555",
    marginBottom: 3,
  },
  contractNumberValue: {
    fontSize: 11,
    fontFamily: "PTSans",
    fontWeight: "bold",
  },
  warningBlock: {
    border: "1px solid #cccccc",
    borderRadius: 4,
    padding: 6,
    marginBottom: 6,
    gap: 2,
  },
  warningTitle: {
    fontSize: 9,
    fontFamily: "PTSans",
    fontWeight: "bold",
    marginBottom: 2,
  },
  warningText: {
    fontSize: 8,
    color: "#333333",
  },
  warningTextBold: {
    fontSize: 8,
    fontFamily: "PTSans",
    fontWeight: "bold",
  },
  paragraph: {
    fontSize: 9,
    color: "#1a1a1a",
    marginBottom: 8,
    lineHeight: 1.4,
  },
  termsLine: {
    fontSize: 8,
    color: "#444444",
    marginBottom: 6,
  },
  signatureRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
  },
  signatureCol: {
    width: "48%",
  },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 40,
    right: 40,
    fontSize: 8,
    color: "#888888",
    textAlign: "center",
  },
});
