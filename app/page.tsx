"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Profile = { name: string; variant: string; level: string; contributorId: string };
type Task = {
  id: number; category: string; intent: string; question_fr: string; answer_fr: string;
  claim_token: string; claimed_at: string;
};
type Item = {
  id: number;
  category: string;
  question_fr: string;
  status: "available" | "claimed" | "completed";
};
type Stats = {
  total: number;
  counts: { available: number; claimed: number; completed: number };
  items: Item[];
};

function AudioCapture({ label, file, onFile }: { label: string; file: File | null; onFile: (f: File | null) => void }) {
  const [recording, setRecording] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);

  async function start() {
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunks.current = [];
      const r = new MediaRecorder(stream.current);
      recorder.current = r;
      r.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
      r.onstop = () => {
        const type = r.mimeType || "audio/webm";
        const blob = new Blob(chunks.current, { type });
        onFile(new File([blob], "enregistrement.webm", { type }));
        stream.current?.getTracks().forEach((t) => t.stop());
      };
      r.start();
      setRecording(true);
    } catch {
      alert("Le microphone n'est pas disponible. Vous pouvez aussi choisir un fichier audio.");
    }
  }

  function stop() {
    recorder.current?.stop();
    setRecording(false);
  }

  return (
    <div className="audioBox">
      <div className="audioTop">
        <strong>{label}</strong>
        {file && <span className="ok">✓ audio prêt</span>}
      </div>
      <div className="audioActions">
        {!recording ? (
          <button type="button" className="secondary" onClick={start}>🎙️ Enregistrer</button>
        ) : (
          <button type="button" className="danger" onClick={stop}>■ Arrêter</button>
        )}
        <label className="fileButton">
          Choisir un fichier audio
          <input type="file" accept="audio/*,.m4a,.mp3,.wav,.ogg,.webm,.aac" onChange={(e) => onFile(e.target.files?.[0] || null)} />
        </label>
      </div>
      {file && <small>{file.name} · {(file.size / 1024 / 1024).toFixed(2)} Mo</small>}
    </div>
  );
}

export default function Home() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [name, setName] = useState("");
  const [variant, setVariant] = useState("");
  const [level, setLevel] = useState("Langue maternelle");
  const [consent, setConsent] = useState(false);
  const [task, setTask] = useState<Task | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [qText, setQText] = useState("");
  const [aText, setAText] = useState("");
  const [qAudio, setQAudio] = useState<File | null>(null);
  const [aAudio, setAAudio] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState<"all" | "available" | "claimed" | "completed">("all");

  const refresh = useCallback(async () => {
    const r = await fetch("./api/stats", { cache: "no-store" });
    if (r.ok) setStats(await r.json());
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("moov-fang-profile");
      if (saved) setProfile(JSON.parse(saved));
      const savedTask = localStorage.getItem("moov-fang-task");
      if (savedTask) setTask(JSON.parse(savedTask));
    } catch {}
    refresh();
    const timer = setInterval(refresh, 2500);
    return () => clearInterval(timer);
  }, [refresh]);

  function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !variant.trim() || !level || !consent) return;
    const p = { name: name.trim(), variant: variant.trim(), level, contributorId: crypto.randomUUID() };
    localStorage.setItem("moov-fang-profile", JSON.stringify(p));
    setProfile(p);
  }

  async function claim(questionId: number) {
    if (!profile || busy || task) return;
    setBusy(true);
    setNotice("");
    try {
      const r = await fetch("./api/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...profile, questionId }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Impossible de prendre cette question.");
      setTask(data.task);
      localStorage.setItem("moov-fang-task", JSON.stringify(data.task));
      setQText(""); setAText(""); setQAudio(null); setAAudio(null);
      await refresh();
      setTimeout(() => document.getElementById("response-form")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
    } catch (e: any) {
      setNotice(e.message);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function releaseTask() {
    if (!task || busy) return;
    setBusy(true);
    await fetch("./api/release", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: task.id, token: task.claim_token }),
    }).catch(() => null);
    localStorage.removeItem("moov-fang-task");
    setTask(null); setQText(""); setAText(""); setQAudio(null); setAAudio(null);
    await refresh();
    setBusy(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!task || !qAudio || !aAudio || !qText.trim() || !aText.trim() || busy) return;
    setBusy(true);
    setNotice("");
    try {
      const form = new FormData();
      form.set("id", String(task.id));
      form.set("token", task.claim_token);
      form.set("questionText", qText.trim());
      form.set("answerText", aText.trim());
      form.set("questionAudio", qAudio);
      form.set("answerAudio", aAudio);

      const r = await fetch("./api/submit", { method: "POST", body: form });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Envoi impossible.");

      localStorage.removeItem("moov-fang-task");
      setTask(null); setQText(""); setAText(""); setQAudio(null); setAAudio(null);
      setNotice("✅ Merci ! La question #" + String(data.id).padStart(3, "0") + " est maintenant « Déjà faite » pour tout le monde.");
      await refresh();
      setTimeout(() => document.getElementById("questions")?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch (e: any) {
      setNotice(e.message);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  const pct = stats ? Math.round((stats.counts.completed / stats.total) * 100) : 0;
  const visibleItems = stats?.items.filter((item) => filter === "all" || item.status === filter) || [];

  return (
    <main>
      <header className="hero">
        <div className="brand">MOOV ASSIST <span>× KIMBA CONNECT</span></div>
        <h1>Collecte linguistique <em>Fang</em></h1>
        <p>Les 200 questions sont déjà dans le formulaire. Fais défiler la liste et choisis une question disponible à laquelle tu veux répondre.</p>

        <div className="progressWrap">
          <div className="progressText"><b>{stats?.counts.completed ?? 0}/200 déjà faites</b><span>{pct}%</span></div>
          <div className="progress"><i style={{ width: pct + "%" }} /></div>
          <div className="miniStats">
            <span>● {stats?.counts.available ?? "—"} disponibles</span>
            <span>● {stats?.counts.claimed ?? "—"} en cours</span>
            <span>✓ {stats?.counts.completed ?? "—"} déjà faites</span>
          </div>
        </div>
      </header>

      <section className="card info">
        <h2>Comment répondre</h2>
        <ol>
          <li>Renseigne ton profil une seule fois.</li>
          <li>Fais défiler les <b>200 questions déjà affichées</b> et clique sur <b>Répondre</b> pour celle que tu veux.</li>
          <li>Dès que tu la prends, elle passe automatiquement en <b>En cours</b> chez tout le monde.</li>
          <li>Enregistre la question en Fang + sa transcription, puis la réponse en Fang + sa transcription.</li>
          <li>Après validation, elle passe en <b>Déjà faite</b> sur toutes les instances du formulaire.</li>
        </ol>
        <p className="warning">⚠️ Ne prononce jamais un vrai PIN, mot de passe, numéro de compte, numéro de téléphone ou autre donnée personnelle.</p>
      </section>

      {!profile && (
        <section className="card">
          <h2>Ton profil</h2>
          <form onSubmit={saveProfile} className="profileForm">
            <label>Nom ou pseudonyme<input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Ex. Jean" /></label>
            <label>Variante / zone de Fang<input value={variant} onChange={(e) => setVariant(e.target.value)} required placeholder="Ex. Woleu-Ntem, Estuaire…" /></label>
            <label>Niveau en Fang
              <select value={level} onChange={(e) => setLevel(e.target.value)}>
                <option>Langue maternelle</option>
                <option>Très bon niveau</option>
                <option>Bon niveau</option>
              </select>
            </label>
            <label className="check">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} required />
              <span>J'accepte que mes audios et transcriptions soient utilisés pour développer, entraîner et évaluer Moov Assist / KIMBA Connect.</span>
            </label>
            <button className="primary" type="submit">Voir les 200 questions</button>
          </form>
        </section>
      )}

      {profile && (
        <section className="profileBar">
          <div><b>{profile.name}</b><span>{profile.variant} · {profile.level}</span></div>
          <button className="link" onClick={() => {
            if (task) return;
            localStorage.removeItem("moov-fang-profile");
            setProfile(null);
          }} disabled={!!task}>Changer</button>
        </section>
      )}

      {profile && task && (
        <section className="card task" id="response-form">
          <div className="taskHead">
            <span>QUESTION #{String(task.id).padStart(3, "0")}</span>
            <b>{task.category}</b>
          </div>

          <div className="reference">
            <small>QUESTION EN FRANÇAIS</small>
            <h2>{task.question_fr}</h2>
          </div>

          <div className="reference answer">
            <small>RÉPONSE FRANÇAISE DE RÉFÉRENCE</small>
            <p>{task.answer_fr}</p>
          </div>

          <p className="hint">Donne la version naturelle en Fang. Il ne faut pas traduire mot à mot si une formulation plus naturelle existe.</p>

          <form onSubmit={submit}>
            <h3>1. Question en Fang</h3>
            <AudioCapture label="Audio de la question" file={qAudio} onFile={setQAudio} />
            <label>Transcription exacte de la question en Fang
              <textarea value={qText} onChange={(e) => setQText(e.target.value)} required rows={3} placeholder="Écris exactement ce que tu as prononcé…" />
            </label>

            <h3>2. Réponse en Fang</h3>
            <AudioCapture label="Audio de la réponse" file={aAudio} onFile={setAAudio} />
            <label>Transcription exacte de la réponse en Fang
              <textarea value={aText} onChange={(e) => setAText(e.target.value)} required rows={4} placeholder="Écris exactement ce que tu as prononcé…" />
            </label>

            <div className="buttons">
              <button className="primary big" type="submit" disabled={busy || !qAudio || !aAudio || !qText.trim() || !aText.trim()}>
                {busy ? "Envoi en cours…" : "Envoyer la réponse ✓"}
              </button>
              <button className="secondary" type="button" onClick={releaseTask} disabled={busy}>
                Je ne veux plus répondre à cette question
              </button>
            </div>
          </form>
        </section>
      )}

      {notice && <div className="notice">{notice}</div>}

      <section className="card questions" id="questions">
        <div className="boardHead">
          <div>
            <h2>Les 200 questions</h2>
            <p>Choisis directement celle que tu veux. Les statuts se synchronisent automatiquement.</p>
          </div>
          <button className="secondary" onClick={refresh}>Actualiser</button>
        </div>

        <div className="filters">
          <button className={filter === "all" ? "filter active" : "filter"} onClick={() => setFilter("all")}>Toutes</button>
          <button className={filter === "available" ? "filter active" : "filter"} onClick={() => setFilter("available")}>Disponibles</button>
          <button className={filter === "claimed" ? "filter active" : "filter"} onClick={() => setFilter("claimed")}>En cours</button>
          <button className={filter === "completed" ? "filter active" : "filter"} onClick={() => setFilter("completed")}>Déjà faites</button>
        </div>

        {!profile && <div className="callout">Renseigne ton profil au-dessus pour pouvoir sélectionner une question.</div>}

        <div className="questionList">
          {visibleItems.map((item) => {
            const statusLabel = item.status === "available" ? "Disponible" : item.status === "claimed" ? "En cours" : "Déjà faite";
            return (
              <article className={"questionRow " + item.status} key={item.id}>
                <div className="questionNumber">#{String(item.id).padStart(3, "0")}</div>
                <div className="questionBody">
                  <div className="questionMeta"><span>{item.category}</span><b className={"badge " + item.status}>{statusLabel}</b></div>
                  <p>{item.question_fr}</p>
                </div>
                <div className="questionAction">
                  {item.status === "available" ? (
                    <button
                      className="primary small"
                      disabled={!profile || !!task || busy}
                      onClick={() => claim(item.id)}
                    >
                      {task ? "Une question en cours" : "Répondre"}
                    </button>
                  ) : item.status === "claimed" ? (
                    <span className="locked">🔒 En cours</span>
                  ) : (
                    <span className="done">✓ Déjà faite</span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <footer>MOOV ASSIST / KIMBA Connect · Collecte Fang</footer>
    </main>
  );
}
