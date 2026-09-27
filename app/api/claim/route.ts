import { NextRequest, NextResponse } from "next/server";
import { bindings, ensureDb, releaseExpired } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const name = String(body.name || "").trim().slice(0, 100);
  const variant = String(body.variant || "").trim().slice(0, 100);
  const level = String(body.level || "").trim().slice(0, 50);
  const contributorId = String(body.contributorId || "").trim().slice(0, 120);

  if (!name || !variant || !level || !contributorId) {
    return NextResponse.json({ error: "Profil incomplet." }, { status: 400 });
  }

  const { db } = bindings();
  await ensureDb(db);
  await releaseExpired(db);

  for (let attempt = 0; attempt < 4; attempt++) {
    const token = crypto.randomUUID();
    const task = await db.prepare(`
      UPDATE questions
      SET status='claimed', claim_token=?, claimed_by=?, claimed_name=?,
          claimed_variant=?, claimed_level=?, claimed_at=datetime('now')
      WHERE id = (
        SELECT id FROM questions WHERE status='available' ORDER BY RANDOM() LIMIT 1
      )
      AND status='available'
      RETURNING id, category, intent, question_fr, answer_fr, claim_token, claimed_at
    `).bind(token, contributorId, name, variant, level).first();

    if (task) {
      return NextResponse.json({ task }, { headers: { "Cache-Control": "no-store" } });
    }
  }

  return NextResponse.json({ error: "Toutes les questions sont déjà prises ou terminées." }, { status: 409 });
}
