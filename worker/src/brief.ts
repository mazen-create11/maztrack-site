import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { Company } from "./registry";
import { HEADCOUNT_LABEL } from "./registry";
import type { BodaccSignals } from "./bodacc";
import type { Scoring } from "./scoring";

export const BriefSchema = z.object({
  summary: z.string().describe("Three sentences max. What this company is, how it stands today, read from the facts only."),
  angle: z.string().describe("One sentence: the single most credible reason to contact them now, tied to a cited fact."),
  readings: z.array(z.string()).max(5).describe("Each item: one fact from the data and what a salesperson should conclude from it."),
  email: z.object({
    subject: z.string().max(80),
    body: z.string().describe("90 to 130 words. Addressed to the executive. Plain, specific, no flattery, no buzzwords, one clear ask."),
  }),
  cautions: z.array(z.string()).max(4).describe("What the data does NOT say and must be checked before any claim is made to this prospect."),
});

export type Brief = z.infer<typeof BriefSchema>;

// Frozen system prompt: identical bytes on every call so the prefix cache hits.
const SYSTEM = `You are the analyst inside Maztrack, a B2B prospecting tool for the French market.
You receive verified facts about one French company: official registry record (INSEE/Etalab), legal notices (BODACC) and a deterministic propensity score with its signals.

Rules, in order of priority:
1. Never invent. Every statement must trace to a provided fact. If a fact is missing, say it is missing instead of guessing.
2. The reader is a salesperson who will call or write this company today. Give them what changes their approach, not a company profile.
3. The outreach email must be legal to send under French and EU rules (B2B, legitimate interest, named role, easy opt-out implied by tone). No fake familiarity, no claim about results the sender has not proven, no "I noticed you" openers about things not in the data.
4. Register: direct, concrete, short sentences. No marketing adjectives. No exclamation marks.
5. Write everything in the requested language. Keep company names, NAF codes and dates exactly as given.`;

export interface BriefResult {
  brief: Brief;
  model: string;
  usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens: number | null };
}

function describe(c: Company, b: BodaccSignals, s: Scoring, senderContext: string): string {
  const exec = [c.executive.firstName, c.executive.lastName].filter(Boolean).join(" ");
  const lines = [
    `Company: ${c.name} (SIREN ${c.siren})`,
    `Registered office: ${c.postalCode || "?"} ${c.city || "?"} (department ${c.department || "?"})`,
    `Main activity (NAF): ${c.naf || "unknown"} ${c.nafSection ? `(section ${c.nafSection})` : ""}`,
    `Created: ${c.createdAt || "unknown"}`,
    `Headcount band (INSEE): ${c.headcountBand ? HEADCOUNT_LABEL[c.headcountBand] || c.headcountBand : "unknown"}`,
    `Employer: ${c.isEmployer ? "yes" : "no or unknown"}`,
    `Open establishments: ${c.openSites ?? "unknown"}`,
    `Executive: ${exec || "not published"}${c.executive.role ? `, ${c.executive.role}` : ""}`,
    `Latest published finances: ${c.latestRevenue ? `${c.latestRevenue.year}, revenue ${c.latestRevenue.revenue ?? "n/a"} EUR, net result ${c.latestRevenue.netResult ?? "n/a"} EUR` : "none published"}`,
    `Flags: ${[c.isQualiopi && "Qualiopi", c.isTrainingOrg && "training organisation", c.isRge && "RGE", c.isEss && "ESS", c.isSoleTrader && "sole trader"].filter(Boolean).join(", ") || "none"}`,
    `Collective agreements (IDCC): ${c.idcc.join(", ") || "none listed"}`,
    "",
    `BODACC notices (${b.available ? `${b.notices.length} most recent` : "unavailable during this request"}):`,
    ...b.notices.slice(0, 8).map((n) => `- ${n.date}: ${n.family} (${n.type})`),
    "",
    `Propensity score: ${s.score}/100${s.excluded ? ` (EXCLUDED: ${s.exclusionReason})` : ""}`,
    "Signals:",
    ...s.signals.map((x) => `- ${x.key}: ${x.points >= 0 ? "+" : ""}${x.points} pts, ${x.detail}`),
    "",
    `Sender context: ${senderContext}`,
  ];
  return lines.join("\n");
}

export async function writeBrief(opts: {
  apiKey: string;
  model: string;
  company: Company;
  bodacc: BodaccSignals;
  scoring: Scoring;
  lang: "fr" | "en";
  senderContext: string;
}): Promise<BriefResult> {
  const client = new Anthropic({ apiKey: opts.apiKey, maxRetries: 1, timeout: 90_000 });
  const language = opts.lang === "fr" ? "French" : "English";
  const response = await client.messages.parse({
    model: opts.model,
    max_tokens: 2500,
    output_config: { effort: "low", format: zodOutputFormat(BriefSchema) },
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: `Language of the answer: ${language}.\n\n${describe(opts.company, opts.bodacc, opts.scoring, opts.senderContext)}`,
      },
    ],
  });
  if (response.stop_reason === "refusal") throw new Error("refusal");
  if (!response.parsed_output) throw new Error("unparsed");
  return {
    brief: response.parsed_output,
    model: response.model,
    usage: {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
      cache_read_input_tokens: response.usage.cache_read_input_tokens ?? null,
    },
  };
}
