import { renderToBuffer } from "@react-pdf/renderer";
import "./fonts";
import { ContractPdfDocument, type ContractPdfProps } from "./ContractPdf";
import { ProtocolPdfDocument, type ProtocolPdfProps } from "./ProtocolPdf";
import { AnnexPdfDocument, type AnnexPdfProps } from "./AnnexPdf";
import { TermsPdfDocument, type TermsPdfProps } from "./TermsPdf";

export async function renderContractPdf(props: ContractPdfProps): Promise<Buffer> {
  return renderToBuffer(<ContractPdfDocument {...props} />);
}

export async function renderProtocolPdf(props: ProtocolPdfProps): Promise<Buffer> {
  return renderToBuffer(<ProtocolPdfDocument {...props} />);
}

export async function renderAnnexPdf(props: AnnexPdfProps): Promise<Buffer> {
  return renderToBuffer(<AnnexPdfDocument {...props} />);
}

export async function renderTermsPdf(props: TermsPdfProps): Promise<Buffer> {
  return renderToBuffer(<TermsPdfDocument {...props} />);
}
