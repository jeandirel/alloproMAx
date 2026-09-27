import { NextResponse } from "next/server";
import { bindings, ensureDb, releaseExpired } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const { db } = bindings();
  await ensureDb(db);
  await releaseExpired(db);

  const grouped = await db.prepare("SELECT status, COUNT(*) AS n FROM questions GROUP BY status").all();
  const rows = await db.prepare("SELECT id, status FROM questions ORDER BY id").all();

  const counts = { available: 0, claimed: 0, completed: 0 };
  for (const row of grouped.results || []) {
    if (row.status in counts) (counts as any)[row.status] = Number(row.n || 0);
  }

  return NextResponse.json({ total: 200, counts, items: rows.results || [] }, {
    headers: { "Cache-Control": "no-store" }
  });
}
