"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Profile = { name: string; variant: string; level: string; contributorId: string };
type Task = {
  id: number; category: string; intent: string; question_fr: string; answer_fr: string;
  claim_token: string; claimed_at: string;
};
type Stats = {
  total: number;
  counts: { available: number; claimed: number; completed: number };
  items: { id: number; status: "available" | "claimed" | "completed" }[];
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
      alert("Le microphone n'est pas disponible. Utilisez le bouton « Choisir un fichier audio ».");
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
    const timer = setInterval(refresh, 4000);
    return () => clearInterval(timer);
  }, [refresh]);

  function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !variant.trim() || !level || !consent) return;
    const p = { name: name.trim(), variant: variant.trim(), level, contributorId: crypto.randomUUID() };
    localStorage.setItem("moov-fang-profile", JSON.stringify(p));
    setProfile(p);
  }

  async function claim() {
    if (!profile || busy) return;
    setBusy(true); setNotice("");
    try {
      const r = await fetch("./api/claim", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Impossible de prendre une question.");
      setTask(data.task);
      localStorage.setItem("moov-fang-task", JSON.stringify(data.task));
      setQText(""); setAText(""); setQAudio(null); setAAudio(null);
      await refresh();
    } catch (e: any) { setNotice(e.message); }
    finally { setBusy(false); }
  }

  async function releaseTask() {
    if (!task || busy) return;
    setBusy(true);
    await fetch("./api/release", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: task.id, token: task.claim_token }),
    }).catch(() => null);
    localStorage.removeItem("moov-fang-task");
    setTask(null); setQText(""); setAText(""); setQAudio(null); setAAudio(null);
    await refresh(); setBusy(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!task || !qAudio || !aAudio || !qText.trim() || !aText.trim() || busy) return;
    setBusy(true); setNotice("");
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
      setNotice("✅ Merci ! Cette question est maintenant marquée « Déjà faite » pour tout le monde.");
      await refresh();
    } catch (e: any) { setNotice(e.message); }
    finally { setBusy(false); }
  }

  const pct = stats ? Math.round((stats.counts.completed / stats.total) * 100) : 0;

  return (
    <main>
      <header className="hero">
        <div className="brand">MOOV ASSIST <span>× KIMBA CONNECT</span></div>
        <h1>Collecte linguistique <em>Fang</em></h1>
        <p>200 situations Moov Money à traduire naturellement, transcrire et enregistrer en Fang.</p>
        <div className="progressWrap">
          <div className="progressText"><b>{stats?.counts.completed ?? 0}/200 terminées</b><span>{pct}%</span></div>
          <div className="progress"><i style={{ width: pct + "%" }} /></div>
          <div className="miniStats">
            <span>● {stats?.counts.available ?? "—"} disponibles</span>
            <span>● {stats?.counts.claimed ?? "—"} en cours</span>
            <span>✓ {stats?.counts.completed ?? "—"} déjà faites</span>
          </div>
        </div>
      </header>

      <section className="card info">
        <h2>Comment ça marche ?</h2>
        <ol>
          <li>Tu prends <b>une seule question disponible</b>. Elle devient immédiatement « En cours » pour tous.</li>
          <li>Tu dis la question en Fang, puis tu écris exactement ce que tu as dit.</li>
          <li>Tu donnes la réponse en Fang, puis tu écris exactement ta réponse.</li>
          <li>Après envoi, la question devient <b>« Déjà faite » partout</b> et personne d'autre ne peut la refaire.</li>
        </ol>
        <p className="warning">⚠️ Ne prononce jamais un vrai PIN, mot de passe, numéro de compte ou donnée personnelle.</p>
      </section>

      {!profile ? (
        <section className="card">
          <h2>Avant de commencer</h2>
          <form onSubmit={saveProfile} className="profileForm">
            <label>Nom ou pseudonyme<input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Ex. Jean" /></label>
            <label>Variante / zone de Fang<input value={variant} onChange={(e) => setVariant(e.target.value)} required placeholder="Ex. Fang de Woleu-Ntem / Estuaire…" /></label>
            <label>Niveau en Fang
              <select value={level} onChange={(e) => setLevel(e.target.value)}>
                <option>Langue maternelle</option><option>Très bon niveau</option><option>Bon niveau</option>
              </select>
            </label>
            <label className="check"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} required />
              <span>J'accepte que mes audios et transcriptions soient utilisés pour développer, entraîner et évaluer le prototype Moov Assist / KIMBA Connect.</span>
            </label>
            <button className="primary" type="submit">Commencer</button>
          </form>
        </section>
      ) : !task ? (
        <section className="card center">
          <div className="avatar">{profile.name.slice(0, 1).toUpperCase()}</div>
          <h2>Bonjour {profile.name} 👋🏾</h2>
          <p>{profile.variant} · {profile.level}</p>
          <button className="primary big" onClick={claim} disabled={busy || stats?.counts.available === 0}>
            {busy ? "Attribution…" : stats?.counts.available === 0 ? "Plus de question disponible" : "Recevoir une question"}
          </button>
          <button className="link" onClick={() => { localStorage.removeItem("moov-fang-profile"); setProfile(null); }}>Changer de profil</button>
        </section>
      ) : (
        <section className="card task">
          <div className="taskHead"><span>QUESTION #{String(task.id).padStart(3, "0")}</span><b>{task.category}</b></div>
          <div className="reference">
            <small>QUESTION EN FRANÇAIS</small>
            <h2>{task.question_fr}</h2>
          </div>
          <div className="reference answer">
            <small>RÉPONSE FRANÇAISE DE RÉFÉRENCE</small>
            <p>{task.answer_fr}</p>
          </div>
          <p className="hint">Traduis/adapte de façon naturelle en Fang. <b>Pas besoin de traduire mot à mot.</b></p>

          <form onSubmit={submit}>
            <h3>1. La question en Fang</h3>
            <AudioCapture label="Audio de la question" file={qAudio} onFile={setQAudio} />
            <label>Transcription exacte de ta question en Fang
              <textarea value={qText} onChange={(e) => setQText(e.target.value)} required rows={3} placeholder="Écris exactement ce que tu as prononcé…" />
            </label>

            <h3>2. La réponse en Fang</h3>
            <AudioCapture label="Audio de la réponse" file={aAudio} onFile={setAAudio} />
            <label>Transcription exacte de ta réponse en Fang
              <textarea value={aText} onChange={(e) => setAText(e.target.value)} required rows={4} placeholder="Écris exactement ce que tu as prononcé…" />
            </label>

            <div className="buttons">
              <button className="primary big" type="submit" disabled={busy || !qAudio || !aAudio || !qText.trim() || !aText.trim()}>
                {busy ? "Envoi en cours…" : "Envoyer et marquer comme déjà faite ✓"}
              </button>
              <button className="secondary" type="button" onClick={releaseTask} disabled={busy}>Je ne peux pas répondre — libérer</button>
            </div>
          </form>
        </section>
      )}

      {notice && <div className="notice">{notice}</div>}

      <section className="card board">
        <div className="boardHead"><div><h2>Les 200 questions</h2><p>Le statut se met à jour automatiquement pour tous les participants.</p></div><button className="secondary" onClick={refresh}>Actualiser</button></div>
        <div className="legend"><span className="dot available"/>Disponible <span className="dot claimed"/>En cours <span className="dot completed"/>Déjà faite</div>
        <div className="grid">
          {stats?.items.map((item) => <div key={item.id} className={"q " + item.status} title={"Question " + item.id + " — " + item.status}>{String(item.id).padStart(3, "0")}{item.status === "completed" ? " ✓" : ""}</div>)}
        </div>
      </section>

      <footer>Prototype de collecte linguistique — MOOV ASSIST / KIMBA Connect · Fang</footer>
    </main>
  );
}
