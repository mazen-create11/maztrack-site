const API = "https://maztrack-radar.maz-chaban.workers.dev";

const $ = (s) => document.querySelector(s);
const out = $("#out");
const status = $("#status");
let lang = "fr";

const HEADCOUNT = {
  NN: "non employeur", "00": "0", "01": "1-2", "02": "3-5", "03": "6-9", "11": "10-19", "12": "20-49",
  "21": "50-99", "22": "100-199", "31": "200-249", "32": "250-499", "41": "500-999", "42": "1000-1999",
  "51": "2000-4999", "52": "5000-9999", "53": "10000+",
};

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const eur = (n) => (n == null ? "n/a" : new Intl.NumberFormat("fr-FR").format(n) + " €");

async function health() {
  try {
    const r = await fetch(`${API}/health`);
    const j = await r.json();
    status.className = "status " + (j.ai ? "on" : "off");
    status.querySelector("span").textContent = j.ai ? `api live · ${j.model}` : "api live · brief paused";
    $("#ver").textContent = "v" + j.version;
  } catch {
    status.className = "status off";
    status.querySelector("span").textContent = "api unreachable";
  }
}

function company(c, s, b) {
  const exec = [c.executive?.firstName, c.executive?.lastName].filter(Boolean).join(" ");
  const rows = [
    ["SIREN", c.siren],
    ["Activity", c.naf || "?"],
    ["Created", c.createdAt || "?"],
    ["Headcount", c.headcountBand ? HEADCOUNT[c.headcountBand] || c.headcountBand : "?"],
    ["Employer", c.isEmployer ? "yes" : "no / unknown"],
    ["Open sites", c.openSites ?? "?"],
    ["Executive", exec ? `${exec}${c.executive.role ? ", " + c.executive.role : ""}` : "not published"],
    ["Latest accounts", c.latestRevenue ? `${c.latestRevenue.year}: revenue ${eur(c.latestRevenue.revenue)}, net ${eur(c.latestRevenue.netResult)}` : "none published"],
    ["BODACC", b.available ? `${b.notices.length} recent notices` : "unavailable"],
  ];
  const scoreClass = s.excluded ? "ex" : s.score < 30 ? "low" : "";
  return `
    <div class="company">
      <div class="k">Record</div>
      <h3>${esc(c.name)}</h3>
      <div class="sub">${esc(c.postalCode || "")} ${esc(c.city || "")}</div>
      <table class="facts-table">${rows.map(([k, v]) => `<tr><td>${k}</td><td>${esc(v)}</td></tr>`).join("")}</table>
      <div class="score"><span class="n ${scoreClass}">${s.excluded ? "✕" : s.score}</span><small>${s.excluded ? esc(s.exclusionReason) : "/ 100 · propensity, rules only"}</small></div>
      <ul class="sig">${s.signals.map((x) => `<li><b class="${x.points ? "" : "zero"}">${x.points > 0 ? "+" + x.points : x.points}</b><span>${esc(x.detail)}</span></li>`).join("")}</ul>
    </div>`;
}

function brief(bf) {
  if (!bf) return `<div class="brief"><div class="k">Brief</div><p class="err" style="padding:0">The AI brief is paused on this demo. Facts and score on the left are live.</p></div>`;
  return `
    <div class="brief">
      <div class="k">Brief</div>
      <p>${esc(bf.summary)}</p>
      <p class="angle">${esc(bf.angle)}</p>
      <ul>${bf.readings.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>
      <div class="k">Email</div>
      <div class="mail"><div class="subj">Subject: ${esc(bf.email.subject)}</div>${esc(bf.email.body)}</div>
      ${bf.cautions.length ? `<div class="k" style="margin-top:14px">Before you send</div><ul class="caut">${bf.cautions.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>` : ""}
    </div>`;
}

function meta(m, c) {
  const bits = [];
  if (m?.model) bits.push(`model ${m.model}`);
  if (m?.usage) bits.push(`tokens in ${m.usage.input_tokens} / out ${m.usage.output_tokens}${m.usage.cache_read_input_tokens ? ` / cached ${m.usage.cache_read_input_tokens}` : ""}`);
  if (m?.ms) bits.push(`${(m.ms / 1000).toFixed(1)} s`);
  if (m?.otherMatches?.length) {
    bits.push("other matches: " + m.otherMatches.slice(0, 3).map((o) => `<a href="#" data-try="${esc(o.siren)}">${esc(o.name)} (${esc(o.city || "?")})</a>`).join(", "));
  }
  bits.push(`<a href="https://annuaire-entreprises.data.gouv.fr/entreprise/${c.siren}" target="_blank" rel="noopener">check the record ↗</a>`);
  return `<div class="meta">${bits.map((b) => `<span>${b}</span>`).join("")}</div>`;
}

function render(j) {
  out.innerHTML = `<div class="out-grid">${company(j.company, j.scoring, j.bodacc)}${brief(j.brief)}${meta(j.meta, j.company)}</div>`;
}

async function run(query) {
  const btn = $("#go");
  btn.disabled = true;
  out.className = "out show";
  out.innerHTML = `<div class="skel"><i></i>registry → BODACC → score → Claude… about 20 seconds</div>`;
  try {
    const r = await fetch(`${API}/brief`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query, lang, senderContext: $("#ctx").value }),
    });
    const j = await r.json();
    if (r.status === 200 || (r.status === 502 && j.company)) {
      render(j);
      if (r.status === 502) out.insertAdjacentHTML("afterbegin", `<div class="err">${esc(j.message)}</div>`);
    } else {
      out.innerHTML = `<div class="err">${esc(j.message || j.error || "error")}</div>`;
    }
  } catch (e) {
    out.innerHTML = `<div class="err">Network error: ${esc(e.message)}</div>`;
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
  document.querySelectorAll("#lang button").forEach((x) => x.classList.toggle("on", x === b));
});
document.addEventListener("click", (e) => {
  const a = e.target.closest("a[data-try]");
  if (!a) return;
  e.preventDefault();
  $("#q").value = a.dataset.try;
  $("#radar").scrollIntoView({ behavior: "smooth", block: "start" });
  run(a.dataset.try);
});

health();
