import Anthropic from "@anthropic-ai/sdk";
import { buildSystemPrompt } from "@/lib/chatbot-context";

// Endpoint de l'assistant IA du site. Reçoit l'historique de conversation et
// renvoie la réponse de Claude en streaming (texte brut, chunk par chunk).
//
// Nécessite ANTHROPIC_API_KEY (à définir dans l'environnement / Vercel). Le
// modèle est configurable via ANTHROPIC_MODEL (défaut : claude-opus-5 ; pour un
// widget de chat, claude-haiku-4-5 est bien moins cher et plus rapide).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5";
const MAX_MESSAGES = 16; // garde-fou : on ne renvoie que la fin de l'historique
const MAX_LEN = 4000; // longueur max d'un message (caractères)

// Effort réglable seulement sur les modèles récents (opus/sonnet-5/fable).
// Haiku 4.5 et Sonnet 4.5 rejettent output_config.effort → on l'omet pour eux.
const SUPPORTS_EFFORT = !/haiku|sonnet-4-5|-3-/.test(MODEL);

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

// Nettoie l'historique reçu du client : rôles valides, contenu texte non vide,
// tronqué en longueur, limité en nombre, et commençant par un message user.
function sanitize(raw) {
  if (!Array.isArray(raw)) return [];
  let msgs = raw
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map((m) => ({ role: m.role, content: m.content.trim().slice(0, MAX_LEN) }))
    .filter((m) => m.content.length > 0)
    .slice(-MAX_MESSAGES);
  // L'API exige que le premier message soit « user ».
  while (msgs.length && msgs[0].role !== "user") msgs = msgs.slice(1);
  return msgs;
}

export async function POST(req) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return json({ error: "chat_unconfigured" }, 503);
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }

  const messages = sanitize(body?.messages);
  if (!messages.length) return json({ error: "empty" }, 400);

  const client = new Anthropic();

  const params = {
    model: MODEL,
    max_tokens: 1024,
    system: [
      { type: "text", text: buildSystemPrompt(), cache_control: { type: "ephemeral" } },
    ],
    messages,
    stream: true,
  };
  if (SUPPORTS_EFFORT) params.output_config = { effort: "low" };

  let anthropicStream;
  try {
    anthropicStream = await client.messages.create(params);
  } catch (err) {
    // Cause réelle journalisée côté serveur (logs Vercel), sans l'exposer au
    // client. Ex. fréquents : 401 (clé invalide), 400 « credit balance too low ».
    const upstreamStatus = typeof err?.status === "number" ? err.status : null;
    const detail = (err?.error?.error?.message || err?.message || "").slice(0, 300);
    console.error("[chat] upstream error", upstreamStatus, MODEL, detail);
    return json({ error: "upstream" }, 502);
  }

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of anthropicStream) {
          if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
      } catch {
        // Coupure amont : on clôt proprement, le client affiche ce qu'il a reçu.
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
