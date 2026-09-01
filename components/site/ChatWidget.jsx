"use client";
import React from "react";
import { Icon } from "@/components/ds";

// Assistant IA du site : bulle flottante + panneau de chat. Parle à la route
// /api/chat (Claude) en streaming. Aucune dépendance lourde importée côté client
// (les coordonnées sont en dur pour ne pas embarquer les données formations).

const PHONE = "09 83 53 20 25";
const PHONE_HREF = "+33983532025";

const WELCOME =
  "Bonjour ! Je suis l'assistant IA d'ABCM Performances. Posez-moi vos questions sur nos services, nos formations ou la publicité sur les IA, et je vous oriente.";
const FALLBACK = `Désolé, je rencontre un souci technique. Vous pouvez nous joindre via le [formulaire de contact](/contact) ou au ${PHONE}.`;
const SUGGESTIONS = [
  "Quels services proposez-vous ?",
  "Vous faites de la publicité sur les IA ?",
  "Quelles formations en IA proposez-vous ?",
  "Comment vous contacter ?",
];

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Rend un message assistant : échappe le HTML, puis autorise liens Markdown
// (internes ou http/https), gras **…** et retours à la ligne. Sûr : on échappe
// d'abord et on restreint les URL à un jeu de caractères sans guillemets.
function formatAssistant(text) {
  let h = esc(text);
  h = h.replace(
    /\[([^\]]+)\]\((\/[A-Za-z0-9\-._/#?=&%]*|https?:\/\/[A-Za-z0-9\-._/#?=&%]+)\)/g,
    (_m, label, url) => {
      const ext = url.startsWith("http");
      const attrs = ext ? ' target="_blank" rel="noopener noreferrer"' : "";
      return `<a href="${url}"${attrs}>${label}</a>`;
    },
  );
  h = h.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  h = h.replace(/\n/g, "<br/>");
  return h;
}

export function ChatWidget() {
  const [open, setOpen] = React.useState(false);
  const [messages, setMessages] = React.useState([]); // {role, content}
  const [input, setInput] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const scrollRef = React.useRef(null);
  const inputRef = React.useRef(null);

  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, open, busy]);

  React.useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  async function send(text) {
    const content = String(text || "").trim();
    if (!content || busy) return;
    const history = [...messages, { role: "user", content }];
    setMessages([...history, { role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);

    const setLastAssistant = (value) =>
      setMessages((m) => {
        const c = m.slice();
        c[c.length - 1] = { role: "assistant", content: value };
        return c;
      });

    try {
      const res = await fetch("/api/chat/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });
      if (!res.ok || !res.body) throw new Error("bad_response");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setLastAssistant(acc);
      }
      if (!acc.trim()) setLastAssistant(FALLBACK);
    } catch {
      setLastAssistant(FALLBACK);
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e) {
    e.preventDefault();
    send(input);
  }

  const empty = messages.length === 0;

  return (
    <div className="abcm-chat">
      {/* Lanceur */}
      <button
        type="button"
        className={"abcm-chat__fab" + (open ? " is-open" : "")}
        aria-label={open ? "Fermer l'assistant" : "Ouvrir l'assistant IA"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? (
          <Icon name="x" size={22} />
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z" />
            <path d="M9.5 10h.01M13.5 10h.01" />
          </svg>
        )}
        {!open ? <span className="abcm-chat__fab-pulse" aria-hidden="true" /> : null}
      </button>

      {/* Panneau */}
      {open ? (
        <div className="abcm-chat__panel" role="dialog" aria-label="Assistant IA ABCM Performances">
          <header className="abcm-chat__head">
            <span className="abcm-chat__avatar" aria-hidden="true"><Icon name="sparkles" size={18} /></span>
            <span className="abcm-chat__head-txt">
              <span className="abcm-chat__title">Assistant ABCM</span>
              <span className="abcm-chat__status"><span className="abcm-chat__dot" aria-hidden="true" /> En ligne · IA</span>
            </span>
            <button type="button" className="abcm-chat__close" aria-label="Fermer" onClick={() => setOpen(false)}>
              <Icon name="x" size={18} />
            </button>
          </header>

          <div className="abcm-chat__body" ref={scrollRef}>
            <div className="abcm-chat__msg abcm-chat__msg--bot">
              <div className="abcm-chat__bubble" dangerouslySetInnerHTML={{ __html: formatAssistant(WELCOME) }} />
            </div>

            {messages.map((m, i) =>
              m.role === "user" ? (
                <div className="abcm-chat__msg abcm-chat__msg--me" key={i}>
                  <div className="abcm-chat__bubble">{m.content}</div>
                </div>
              ) : (
                <div className="abcm-chat__msg abcm-chat__msg--bot" key={i}>
                  <div className="abcm-chat__bubble">
                    {m.content ? (
                      <span dangerouslySetInnerHTML={{ __html: formatAssistant(m.content) }} />
                    ) : (
                      <span className="abcm-chat__typing" aria-label="En train d'écrire"><i /><i /><i /></span>
                    )}
                  </div>
                </div>
              ),
            )}

            {empty ? (
              <div className="abcm-chat__suggests">
                {SUGGESTIONS.map((q) => (
                  <button type="button" className="abcm-chat__chip" key={q} onClick={() => send(q)} disabled={busy}>
                    {q}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <form className="abcm-chat__form" onSubmit={onSubmit}>
            <input
              ref={inputRef}
              type="text"
              className="abcm-chat__input"
              placeholder="Écrivez votre message…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              aria-label="Votre message"
              maxLength={2000}
            />
            <button type="submit" className="abcm-chat__send" aria-label="Envoyer" disabled={busy || !input.trim()}>
              <Icon name="send" size={18} />
            </button>
          </form>
          <p className="abcm-chat__foot">
            Assistant IA · pour un devis, <a href={`tel:${PHONE_HREF}`}>{PHONE}</a> ou le <a href="/contact">contact</a>.
          </p>
        </div>
      ) : null}
    </div>
  );
}
