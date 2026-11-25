import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-organizer-code",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Distribuzione bilanciata: in ogni giro seleziona gli eventi meno usati.
function makeCards(count: number) {
  const uses = Array(30).fill(0);
  const output = [];
  for (let n = 1; n <= count; n++) {
    const ranked = shuffle(Array.from({ length: 30 }, (_, i) => i + 1))
      .sort((a, b) => uses[a - 1] - uses[b - 1]);
    const chosen = ranked.slice(0, 6);
    chosen.forEach(id => uses[id - 1]++);
    output.push({ card_number: n, events: shuffle(chosen) });
  }
  return output;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Metodo non consentito" }, 405);

  const expected = Deno.env.get("ORGANIZER_CODE");
  const supplied = req.headers.get("x-organizer-code");
  if (!expected || !supplied) return json({ error: "Codice organizzatore non valido" }, 401);
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(supplied || "")),
    crypto.subtle.digest("SHA-256", encoder.encode(expected || "missing")),
  ]);
  const aa = new Uint8Array(a), bb = new Uint8Array(b);
  let diff = aa.length ^ bb.length;
  for (let i = 0; i < aa.length; i++) diff |= aa[i] ^ bb[i];
  if (diff !== 0) return json({ error: "Codice organizzatore non valido" }, 401);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ error: "Configurazione server incompleta" }, 500);
  const db = createClient(url, serviceKey, { auth: { persistSession: false } });

  let body: { action?: string; count?: number };
  try { body = await req.json(); } catch { return json({ error: "Richiesta non valida" }, 400); }

  if (body.action === "check") return json({ ok: true });

  if (body.action === "reset") {
    const { error } = await db.from("nuffle_event_marks").delete().gte("event_id", 1);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  if (body.action === "generate") {
    const count = Number(body.count);
    if (!Number.isInteger(count) || count < 1 || count > 100) {
      return json({ error: "Il numero di cartelle deve essere compreso tra 1 e 100" }, 400);
    }
    const { error: deleteCardsError } = await db.from("nuffle_cards").delete().gte("card_number", 1);
    if (deleteCardsError) return json({ error: deleteCardsError.message }, 500);
    const { error: deleteMarksError } = await db.from("nuffle_event_marks").delete().gte("event_id", 1);
    if (deleteMarksError) return json({ error: deleteMarksError.message }, 500);
    const rows = makeCards(count);
    const { error: insertError } = await db.from("nuffle_cards").insert(rows);
    if (insertError) return json({ error: insertError.message }, 500);
    return json({ ok: true, count });
  }

  return json({ error: "Azione sconosciuta" }, 400);
});
