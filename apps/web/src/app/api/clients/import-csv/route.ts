import { NextResponse } from "next/server";
import { importClientsFromCsvRows, parseCsv } from "@rent-a-car/api/server";
import { requireModulePermission } from "@/lib/requireOwnerSession";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireModulePermission(request, "clients");
  if (!auth.authorized) return auth.response;

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file_required" }, { status: 400 });
  }

  const text = await file.text();
  const rows = parseCsv(text);
  if (rows.length === 0) {
    return NextResponse.json({ error: "empty_csv" }, { status: 400 });
  }

  const result = await importClientsFromCsvRows(rows);
  return NextResponse.json(result);
}
