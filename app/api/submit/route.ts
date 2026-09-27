import { NextRequest, NextResponse } from "next/server";
import { bindings, ensureDb } from "@/lib/db";

export const dynamic = "force-dynamic";

function isAudio(file: File) {
  return file.type.startsWith("audio/") || /\.(m4a|mp3|wav|ogg|webm|aac)$/i.test(file.name);
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const id = Number(form.get("id"));
  const token = String(form.get("token") || "");
  const questionText = String(form.get("questionText") || "").trim();
  const answerText = String(form.get("answerText") || "").trim();
  const qAudio = form.get("questionAudio");
  const aAudio = form.get("answerAudio");

  if (!id || !token || !questionText || !answerText || !(qAudio instanceof File) || !(aAudio instanceof File)) {
    return NextResponse.json({ error: "Les deux audios et les deux transcriptions sont obligatoires." }, { status: 400 });
  }
  if (!isAudio(qAudio) || !isAudio(aAudio)) {
    return NextResponse.json({ error: "Les fichiers doivent être des fichiers audio." }, { status: 400 });
  }
  const max = 12 * 1024 * 1024;
  if (qAudio.size > max || aAudio.size > max) {
    return NextResponse.json({ error: "Chaque audio doit faire moins de 12 Mo." }, { status: 400 });
  }

  const { db, audio } = bindings();
  await ensureDb(db);

  const claim = await db.prepare("SELECT id FROM questions WHERE id=? AND claim_token=? AND status='claimed'")
    .bind(id, token).first();
  if (!claim) {
    return NextResponse.json({ error: "Cette question n'est plus réservée pour vous. Rechargez et prenez-en une autre." }, { status: 409 });
  }

  const nonce = crypto.randomUUID();
  const qKey = `q/${id}/${nonce}-question`;
  const aKey = `q/${id}/${nonce}-answer`;

  await audio.put(qKey, qAudio.stream(), { httpMetadata: { contentType: qAudio.type || "audio/webm" } });
  await audio.put(aKey, aAudio.stream(), { httpMetadata: { contentType: aAudio.type || "audio/webm" } });

  const updated = await db.prepare(`
    UPDATE questions
    SET status='completed', completed_at=datetime('now'),
        question_text_fang=?, answer_text_fang=?,
        question_audio_key=?, answer_audio_key=?
    WHERE id=? AND claim_token=? AND status='claimed'
  `).bind(questionText, answerText, qKey, aKey, id, token).run();

  if (Number(updated.meta?.changes || 0) !== 1) {
    await Promise.all([audio.delete(qKey), audio.delete(aKey)]);
    return NextResponse.json({ error: "La réservation a expiré. Les fichiers n'ont pas été conservés." }, { status: 409 });
  }

  return NextResponse.json({ ok: true, id });
}
