import { NextRequest, NextResponse } from "next/server";
import { bindings, ensureDb, releaseExpired } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const name = String(body.name || "").trim().slice(0, 100);
  const variant = String(body.variant || "").trim().slice(0, 100);
  const level = String(body.level || "").trim().slice(0, 50);
  const contributorId = String(body.contributorId || "").trim().slice(0, 120);
  const questionId = Number(body.questionId);

  if (!name || !variant || !level || !contributorId || !Number.isInteger(questionId) || questionId < 1 || questionId > 200) {
    return NextResponse.json({ error: "Profil ou question invalide." }, { status: 400 });
  }

  const { db } = bindings();
  await ensureDb(db);
  await releaseExpired(db);

  const token = crypto.randomUUID();
  const task = await db.prepare(`
    UPDATE questions
    SET status='claimed', claim_token=?, claimed_by=?, claimed_name=?,
        claimed_variant=?, claimed_level=?, claimed_at=datetime('now')
    WHERE id=? AND status='available'
    RETURNING id, category, intent, question_fr, answer_fr, claim_token, claimed_at
  `).bind(token, contributorId, name, variant, level, questionId).first();

  if (!task) {
    return NextResponse.json({
      error: "Cette question vient d'être prise ou a déjà été terminée. Choisissez-en une autre."
    }, { status: 409 });
  }

  return NextResponse.json({ task }, { headers: { "Cache-Control": "no-store" } });
}
