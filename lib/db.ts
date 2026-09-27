import { getCloudflareContext } from "@opennextjs/cloudflare";
import { QUESTIONS } from "@/lib/questions";

export type D1 = any;
export type R2 = any;

export function bindings() {
  const { env } = getCloudflareContext();
  return {
    db: (env as any).DB as D1,
    audio: (env as any).AUDIO_UPLOADS as R2,
  };
}

export async function ensureDb(db: D1) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY,
      category TEXT NOT NULL,
      intent TEXT NOT NULL,
      question_fr TEXT NOT NULL,
      answer_fr TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'available',
      claim_token TEXT,
      claimed_by TEXT,
      claimed_name TEXT,
      claimed_variant TEXT,
      claimed_level TEXT,
      claimed_at TEXT,
      completed_at TEXT,
      question_text_fang TEXT,
      answer_text_fang TEXT,
      question_audio_key TEXT,
      answer_audio_key TEXT
    )
  `).run();

  await db.prepare("CREATE INDEX IF NOT EXISTS idx_questions_status ON questions(status)").run();

  for (let i = 0; i < QUESTIONS.length; i += 40) {
    const statements = QUESTIONS.slice(i, i + 40).map((q) =>
      db.prepare(`
        INSERT OR IGNORE INTO questions
        (id, category, intent, question_fr, answer_fr, status)
        VALUES (?, ?, ?, ?, ?, 'available')
      `).bind(q.id, q.category, q.intent, q.question, q.answer)
    );
    await db.batch(statements);
  }
}

export async function releaseExpired(db: D1) {
  await db.prepare(`
    UPDATE questions
    SET status='available', claim_token=NULL, claimed_by=NULL, claimed_name=NULL,
        claimed_variant=NULL, claimed_level=NULL, claimed_at=NULL
    WHERE status='claimed'
      AND claimed_at IS NOT NULL
      AND claimed_at < datetime('now', '-30 minutes')
  `).run();
}
