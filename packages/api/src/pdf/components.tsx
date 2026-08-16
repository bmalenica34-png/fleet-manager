import type { FC, PropsWithChildren } from "react";
import {
  Document as PdfDocument,
  Page as PdfPage,
  Text as PdfText,
  View as PdfView,
  Image as PdfImage,
  type DocumentProps,
  type PageProps,
  type TextProps,
  type ViewProps,
  type ImageProps,
} from "@react-pdf/renderer";

// @react-pdf/renderer's .d.ts declares these as `class X extends
// React.Component<...>`, which TS rejects as a valid JSX element type
// against @types/react 18.3+ (TS2786: missing 'refs' property) - a known
// upstream incompatibility. Casting once here keeps the actual PDF
// templates free of the workaround.
export const Document = PdfDocument as unknown as FC<PropsWithChildren<DocumentProps>>;
export const Page = PdfPage as unknown as FC<PropsWithChildren<PageProps>>;
export const Text = PdfText as unknown as FC<PropsWithChildren<TextProps>>;
export const View = PdfView as unknown as FC<PropsWithChildren<ViewProps>>;
export const Image = PdfImage as unknown as FC<ImageProps>;
