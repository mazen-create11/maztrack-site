import { searchCompanies, type Company } from "./registry";
import { fetchBodacc } from "./bodacc";
import { scoreCompany } from "./scoring";
import { writeBrief } from "./brief";

export interface Env {
  RATE: KVNamespace;
  ANTHROPIC_API_KEY?: string;
  ALLOWED_ORIGINS: string;
  DAILY_CAP: string;
  IP_CAP: string;
  MODEL: string;
}

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

function corsHeaders(req: Request, env: Env): Record<string, string> {
  const origin = req.headers.get("Origin") || "";
  const allowed = env.ALLOWED_ORIGINS.split(",").map((s) => s.trim());
  const ok = allowed.includes(origin);
  return {
    "access-control-allow-origin": ok ? origin : allowed[0],
    "access-control-allow-methods": "POST, GET, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
    vary: "Origin",
  };
}

function json(body: unknown, status: number, extra: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...extra } });
}

async function sha(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function bump(kv: KVNamespace, key: string, ttl: number): Promise<number> {
  const current = Number((await kv.get(key)) || 0) + 1;
  await kv.put(key, String(current), { expirationTtl: ttl });
  return current;
}

async function checkQuota(req: Request, env: Env): Promise<{ ok: true } | { ok: false; reason: string; retryAfter: number }> {
  const day = new Date().toISOString().slice(0, 10);
  const ip = req.headers.get("CF-Connecting-IP") || "0.0.0.0";
  const ipKey = `ip:${day}:${await sha(ip)}`;
  const dayKey = `day:${day}`;
  const [ipCount, dayCount] = await Promise.all([bump(env.RATE, ipKey, 90_000), bump(env.RATE, dayKey, 90_000)]);
  if (ipCount > Number(env.IP_CAP)) return { ok: false, reason: "ip_quota", retryAfter: 86_400 };
  if (dayCount > Number(env.DAILY_CAP)) return { ok: false, reason: "daily_quota", retryAfter: 86_400 };
  return { ok: true };
}

interface BriefRequest {
  query: string;
  lang: "fr" | "en";
  senderContext: string;
}

function parseBody(raw: unknown): BriefRequest | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  const query = typeof b.query === "string" ? b.query.trim().slice(0, 80) : "";
  if (query.length < 2) return null;
  const lang = b.lang === "en" ? "en" : "fr";
  const senderContext =
    typeof b.senderContext === "string" && b.senderContext.trim()
      ? b.senderContext.trim().slice(0, 240)
      : "an independent consultant offering a free 30-minute diagnostic on sales automation and AI for small businesses";
  return { query, lang, senderContext };
}

async function handleBrief(req: Request, env: Env, cors: Record<string, string>): Promise<Response> {
  if (!env.ANTHROPIC_API_KEY) return json({ error: "demo_offline", message: "The AI brief is paused. Registry lookup still works." }, 503, cors);

  let body: BriefRequest | null = null;
  try {
    body = parseBody(await req.json());
  } catch {
    body = null;
  }
  if (!body) return json({ error: "bad_request", message: "query (2-80 chars) is required" }, 400, cors);

  const quota = await checkQuota(req, env);
  if (!quota.ok) {
    return json(
      { error: quota.reason, message: quota.reason === "ip_quota" ? "Demo limit: 6 briefs per day per connection." : "Today's demo budget is spent. Back tomorrow." },
      429,
      { ...cors, "retry-after": String(quota.retryAfter) },
    );
  }

  const t0 = Date.now();
  const { companies, candidates } = await searchCompanies(body.query);
  if (!companies.length) return json({ error: "not_found", message: "No active company matches in the French registry." }, 404, cors);
  const company: Company = companies[0];

  const bodacc = await fetchBodacc(company.siren);
  const scoring = scoreCompany(company, bodacc);

  try {
    const ai = await writeBrief({
      apiKey: env.ANTHROPIC_API_KEY,
      model: env.MODEL,
      company,
      bodacc,
      scoring,
      lang: body.lang,
      senderContext: body.senderContext,
    });
    return json(
      {
        company,
        bodacc: { available: bodacc.available, notices: bodacc.notices.slice(0, 8) },
        scoring,
        brief: ai.brief,
        meta: { model: ai.model, usage: ai.usage, ms: Date.now() - t0, otherMatches: candidates.slice(1) },
      },
      200,
      cors,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message === "refusal" ? 422 : 502;
    return json(
      {
        error: message === "refusal" ? "refused" : "ai_unavailable",
        message: message === "refusal" ? "The model declined this request." : "The AI brief failed. Facts below are still from the registry.",
        company,
        bodacc: { available: bodacc.available, notices: bodacc.notices.slice(0, 8) },
        scoring,
        meta: { ms: Date.now() - t0, otherMatches: candidates.slice(1) },
      },
      status,
      cors,
    );
  }
}

async function handleLookup(url: URL, cors: Record<string, string>): Promise<Response> {
  const q = (url.searchParams.get("q") || "").trim().slice(0, 80);
  if (q.length < 2) return json({ error: "bad_request" }, 400, cors);
  const { candidates } = await searchCompanies(q);
  return json({ candidates }, 200, cors);
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const cors = corsHeaders(req, env);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    const url = new URL(req.url);

    if (url.pathname === "/health") {
      return json({ ok: true, model: env.MODEL, ai: Boolean(env.ANTHROPIC_API_KEY), version: "0.2.0" }, 200, cors);
    }
    if (url.pathname === "/lookup" && req.method === "GET") return handleLookup(url, cors);
    if (url.pathname === "/brief" && req.method === "POST") return handleBrief(req, env, cors);
    return json({ error: "not_found" }, 404, cors);
  },
} satisfies ExportedHandler<Env>;
