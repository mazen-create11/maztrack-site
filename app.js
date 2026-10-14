const API = "https://maztrack-radar.maz-chaban.workers.dev";
const SAMPLES = { "539130195": "samples/le-slip-francais" };

const $ = (s) => document.querySelector(s);
const out = $("#out");
const status = $("#status");
let lang = "fr";
let aiState = "unknown";
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const HEADCOUNT = {
  NN: "non-employer", "00": "0", "01": "1-2", "02": "3-5", "03": "6-9", "11": "10-19", "12": "20-49",
  "21": "50-99", "22": "100-199", "31": "200-249", "32": "250-499", "41": "500-999", "42": "1000-1999",
  "51": "2000-4999", "52": "5000-9999", "53": "10000+",
};

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const eur = (n) => (n == null ? "n/a" : new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n) + " €");
const tc = (s) => String(s || "").toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
const date = (iso) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "?");

/* ---------- status ---------- */
async function health() {
  try {
    const r = await fetch(`${API}/health`);
    const j = await r.json();
    aiState = j.ai;
    const live = j.ai === "ok";
    status.className = "status " + (live ? "on" : "idle");
    status.querySelector("span").textContent = live ? `live · ${j.model}` : "facts live · brief in example mode";
    $("#ver").textContent = "v" + j.version;
  } catch {
    status.className = "status off";
    status.querySelector("span").textContent = "api unreachable";
  }
}

/* ---------- renderers ---------- */
function companyPanel(c, s, b) {
  const exec = [c.executive?.firstName, c.executive?.lastName].filter(Boolean).map(tc).join(" ");
  const rows = [
    ["SIREN", c.siren.replace(/(\d{3})(\d{3})(\d{3})/, "$1 $2 $3"), "num"],
    ["Activity (NAF)", c.naf || "?", ""],
    ["Created", date(c.createdAt), ""],
    ["Headcount band", c.headcountBand ? HEADCOUNT[c.headcountBand] || c.headcountBand : "?", "num"],
    ["Employer", c.isEmployer ? "yes" : "unknown", ""],
    ["Open sites", c.openSites ?? "?", "num"],
    ["Officer on record", exec ? `${exec}${c.executive.role ? ", " + c.executive.role : ""}` : "not published", ""],
    ["Latest accounts", c.latestRevenue ? `${c.latestRevenue.year} · revenue ${eur(c.latestRevenue.revenue)} · net ${eur(c.latestRevenue.netResult)}` : "none published", "num"],
    ["BODACC", b.available ? `${b.notices.length} recent notices` : "unavailable during this request", "num"],
  ];
  const notices = b.notices.slice(0, 5).map((n) => `<li><time>${date(n.date)}</time><span>${esc(n.family)}</span></li>`).join("");
  const scoreClass = s.excluded ? "ex" : s.score < 30 ? "low" : "";
  return `
    <section class="panel record" aria-label="Registry record">
      <div class="k">Record</div>
      <h3>${esc(c.name)}</h3>
      <div class="sub">${esc(c.postalCode || "")} ${esc(c.city || "")}</div>
      <table class="facts"><tbody>${rows.map(([k, v, cls]) => `<tr><th scope="row">${k}</th><td class="${cls}">${esc(v)}</td></tr>`).join("")}</tbody></table>
      ${notices ? `<div class="k" style="margin-top:18px">Legal notices</div><ul class="notices">${notices}</ul>` : ""}
      <div class="k" style="margin-top:18px">Score</div>
      <div class="score"><span class="n ${scoreClass}">${s.excluded ? "excluded" : s.score}</span><small>${s.excluded ? esc(s.exclusionReason) : "/ 100 · rules only, every point listed"}</small></div>
      <ul class="sig">${s.signals.map((x) => `<li><b class="${x.points ? "" : "zero"}">${x.points > 0 ? "+" + x.points : x.points}</b><span>${esc(x.detail)}</span></li>`).join("")}</ul>
    </section>`;
}

function briefPanel(bf, mode) {
  if (!bf) {
    return `
    <section class="panel brief" aria-label="Brief">
      <div class="k">Brief</div>
      <p class="quiet">Live generation is paused on the public demo. The facts and score on the left are live. <a href="#" data-try="539130195">See a complete example on Le Slip Français</a>, written from the same records with the same rules.</p>
    </section>`;
  }
  const note = mode === "sample"
    ? `<p class="note">Example written by Claude on 14 Oct 2026 from the records on the left, same schema and rules as the live pipeline. Live generation is paused on the public demo.</p>`
    : "";
  return `
    <section class="panel brief" aria-label="Brief">
      <div class="k">Brief</div>
      ${note}
      <p>${esc(bf.summary)}</p>
      <p class="angle">${esc(bf.angle)}</p>
      <ul class="readings">${bf.readings.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>
      <div class="k">First email</div>
      <div class="mail"><div class="subj">${esc(bf.email.subject)}</div>${esc(bf.email.body)}</div>
      ${bf.cautions?.length ? `<div class="k" style="margin-top:16px">Check before sending</div><ul class="caut">${bf.cautions.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>` : ""}
    </section>`;
}

function metaBar(m, c, mode) {
  const bits = [];
  if (mode === "live" && m?.model) bits.push(`${m.model}`);
  if (mode === "live" && m?.usage) bits.push(`${m.usage.input_tokens} in · ${m.usage.output_tokens} out${m.usage.cache_read_input_tokens ? ` · ${m.usage.cache_read_input_tokens} cached` : ""}`);
  if (m?.ms) bits.push(`${(m.ms / 1000).toFixed(1)} s`);
  if (m?.otherMatches?.length) {
    bits.push("also matched: " + m.otherMatches.slice(0, 3).map((o) => `<a href="#" data-try="${esc(o.siren)}">${esc(o.name)}${o.city ? ` (${esc(o.city)})` : ""}</a>`).join(", "));
  }
  bits.push(`<a href="https://annuaire-entreprises.data.gouv.fr/entreprise/${c.siren}" target="_blank" rel="noopener">verify the record ↗</a>`);
  return `<div class="meta">${bits.map((b) => `<span>${b}</span>`).join("")}</div>`;
}

function render(j, mode) {
  out.innerHTML = `<div class="out-grid">${companyPanel(j.company, j.scoring, j.bodacc)}${briefPanel(j.brief, mode)}${metaBar(j.meta, j.company, mode)}</div>`;
  if (!reduceMotion) out.querySelector(".out-grid").animate([{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: 220, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" });
}

/* ---------- progress ---------- */
const STEPS = [["registry", 0], ["bodacc", 700], ["score", 1500], ["claude", 1900]];
let progressTimer = null;
function showProgress(withClaude) {
  const steps = withClaude ? STEPS : STEPS.slice(0, 3);
  out.innerHTML = `<ol class="progress">${steps.map(([s]) => `<li data-step="${s}"><i></i>${s}</li>`).join("")}</ol>`;
  const t0 = performance.now();
  progressTimer = setInterval(() => {
    const t = performance.now() - t0;
    steps.forEach(([s, at]) => { if (t >= at) out.querySelector(`[data-step="${s}"]`)?.classList.add("on"); });
  }, 100);
}
function stopProgress() { clearInterval(progressTimer); progressTimer = null; }

/* ---------- run ---------- */
async function loadSample(siren) {
  const base = SAMPLES[siren];
  const [facts, brief] = await Promise.all([fetch(`${base}.facts.json`).then((r) => r.json()), fetch(`${base}.brief.json`).then((r) => r.json())]);
  return { ...facts, brief: brief[lang] || brief.fr, meta: { ms: null, otherMatches: [] } };
}

async function run(query) {
  const btn = $("#go");
  btn.disabled = true;
  out.className = "out show";
  const sampleSiren = Object.keys(SAMPLES).find((s) => s === query.replace(/\s/g, ""));
  showProgress(aiState === "ok");
  try {
    if (aiState !== "ok" && sampleSiren) {
      const j = await loadSample(sampleSiren);
      await new Promise((r) => setTimeout(r, reduceMotion ? 0 : 1200));
      stopProgress();
      render(j, "sample");
      return;
    }
    const r = await fetch(`${API}/brief`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query, lang, senderContext: $("#ctx").value }),
    });
    const j = await r.json();
    stopProgress();
    if (r.status === 200) {
      render(j, "live");
    } else if (j.company) {
      const siren = j.company.siren;
      if (SAMPLES[siren]) {
        const sample = await loadSample(siren);
        render({ ...j, brief: sample.brief }, "sample");
      } else {
        render({ ...j, brief: null }, "facts");
      }
    } else {
      out.innerHTML = `<p class="err">${esc(j.message || j.error || "Something went wrong.")}</p>`;
    }
  } catch (e) {
    stopProgress();
    out.innerHTML = `<p class="err">Network error: ${esc(e.message)}</p>`;
  } finally {
    btn.disabled = false;
  }
}

$("#f").addEventListener("submit", (e) => {
  e.preventDefault();
  const q = $("#q").value.trim();
  if (q.length >= 2) run(q);
});
$("#lang").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-lang]");
  if (!b) return;
  lang = b.dataset.lang;
  document.querySelectorAll("#lang button").forEach((x) => { x.classList.toggle("on", x === b); x.setAttribute("aria-pressed", x === b); });
});
document.addEventListener("click", (e) => {
  const a = e.target.closest("a[data-try]");
  if (!a) return;
  e.preventDefault();
  $("#q").value = a.dataset.try;
  $("#radar").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  run(a.dataset.try);
});

health();
