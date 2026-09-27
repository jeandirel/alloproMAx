import { NextRequest, NextResponse } from "next/server";
import { bindings, ensureDb } from "@/lib/db";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const id = Number(body.id);
  const token = String(body.token || "");
  if (!id || !token) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });

  const { db } = bindings();
  await ensureDb(db);
  const result = await db.prepare(`
    UPDATE questions
    SET status='available', claim_token=NULL, claimed_by=NULL, claimed_name=NULL,
        claimed_variant=NULL, claimed_level=NULL, claimed_at=NULL
    WHERE id=? AND claim_token=? AND status='claimed'
  `).bind(id, token).run();

  return NextResponse.json({ released: Number(result.meta?.changes || 0) === 1 });
}
