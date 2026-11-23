(() => {
  "use strict";
  const KEY = "kwita:v1";
  const COLORS = ["#5B8CFF", "#FF8A5B", "#12B886", "#B57BFF", "#F2B544", "#F0563A", "#3BB4D8", "#E36BA8"];
  const $ = (s) => document.querySelector(s);

  const DEMO = () => ({
    trip: "Weekend w Tatrach",
    people: [
      { id: "p1", name: "Kuba", c: 0 },
      { id: "p2", name: "Ola", c: 1 },
      { id: "p3", name: "Marek", c: 2 },
      { id: "p4", name: "Zosia", c: 3 },
    ],
    expenses: [
      { id: "e1", desc: "Nocleg w Zakopanem", amount: 120000, payer: "p1", for: ["p1", "p2", "p3", "p4"] },
      { id: "e2", desc: "Paliwo", amount: 32000, payer: "p2", for: ["p1", "p2", "p3", "p4"] },
      { id: "e3", desc: "Zakupy spożywcze", amount: 28640, payer: "p3", for: ["p1", "p2", "p3", "p4"] },
      { id: "e4", desc: "Kolacja w karczmie", amount: 41200, payer: "p4", for: ["p1", "p2", "p3", "p4"] },
      { id: "e5", desc: "Bilety na Kasprowy", amount: 27600, payer: "p3", for: ["p1", "p3", "p4"] },
    ],
    done: [],
  });

  let state = load() || DEMO();
  let settled = false;
  let selFor = new Set(state.people.map((p) => p.id));

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (s && Array.isArray(s.people) && Array.isArray(s.expenses)) return { done: [], ...s };
    } catch (e) {}
    return null;
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  }

  // ---------- money helpers (all amounts in grosze) ----------
  const fmt = (g) => {
    const neg = g < 0;
    const a = Math.abs(Math.round(g));
    const zl = Math.floor(a / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    return (neg ? "−" : "") + zl + "," + String(a % 100).padStart(2, "0") + " zł";
  };
  const parseAmt = (s) => {
    const t = String(s).replace(/\s|zł/gi, "").replace(",", ".");
    if (!/^\d+(\.\d{0,2})?$/.test(t)) return NaN;
    return Math.round(parseFloat(t) * 100);
  };
  const person = (id) => state.people.find((p) => p.id === id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const av = (p) => `<i class="av" style="background:${COLORS[p.c % COLORS.length]}">${esc(p.name.charAt(0).toUpperCase())}</i>`;

  // split each expense equally (remainder grosze go to the first participants)
  function balances() {
    const b = Object.fromEntries(state.people.map((p) => [p.id, 0]));
    for (const e of state.expenses) {
      const n = e.for.length;
      if (!n) continue;
      b[e.payer] += e.amount;
      const base = Math.floor(e.amount / n);
      let rest = e.amount - base * n;
      e.for.forEach((id) => { b[id] -= base + (rest-- > 0 ? 1 : 0); });
    }
    return b;
  }
  // greedy settlement: biggest debtor pays biggest creditor -> at most n-1 transfers
  function settle() {
    const b = balances();
    const cred = [], debt = [];
    for (const [id, v] of Object.entries(b)) { if (v > 0) cred.push({ id, v }); else if (v < 0) debt.push({ id, v: -v }); }
    const out = [];
    while (cred.length && debt.length) {
      cred.sort((x, y) => y.v - x.v); debt.sort((x, y) => y.v - x.v);
      const c = cred[0], d = debt[0];
      const m = Math.min(c.v, d.v);
      out.push({ from: d.id, to: c.id, amount: m });
      c.v -= m; d.v -= m;
      if (!c.v) cred.shift();
      if (!d.v) debt.shift();
    }
    return out;
  }

  // ---------- count-up for headline numbers ----------
  const shown = new Map();
  function countTo(el, value) {
    const from = shown.has(el) ? shown.get(el) : 0;
    shown.set(el, value);
    if (from === value || matchMedia("(prefers-reduced-motion: reduce)").matches) { el.textContent = fmt(value); return; }
    const t0 = performance.now(), dur = 650;
    const step = (t) => {
      const k = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      el.textContent = fmt(from + (value - from) * e);
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // ---------- render ----------
  function render() {
    $("#trip").value = state.trip;
    // people
    $("#people").innerHTML = state.people.map((p) => `<span class="chip">${av(p)}${esc(p.name)}<button class="x" type="button" data-del-person="${p.id}" aria-label="Usuń ${esc(p.name)}">×</button></span>`).join("");
    // payer select
    const payer = $("#expPayer");
    const cur = payer.value;
    payer.innerHTML = state.people.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join("");
    if (person(cur)) payer.value = cur;
    // for chips
    for (const id of [...selFor]) if (!person(id)) selFor.delete(id);
    $("#expFor").innerHTML = state.people.map((p) => `<button type="button" class="chip ${selFor.has(p.id) ? "on" : ""}" data-for="${p.id}" aria-pressed="${selFor.has(p.id)}">${av(p)}${esc(p.name)}</button>`).join("");
    // expenses (newest first)
    const list = [...state.expenses].reverse();
    $("#expCount").textContent = list.length ? `· ${list.length}` : "";
    $("#expList").innerHTML = list.length
      ? list.map((e) => {
          const p = person(e.payer);
          const forTxt = e.for.length === state.people.length ? "wszyscy" : e.for.map((id) => person(id)?.name).filter(Boolean).join(", ");
          return `<li class="exp">${av(p)}<div class="exp-t"><b>${esc(e.desc)}</b><small>Płacił(a) ${esc(p.name)} · za: ${esc(forTxt)}</small></div><span class="exp-a">${fmt(e.amount)}</span><button class="x" type="button" data-del-exp="${e.id}" aria-label="Usuń wydatek ${esc(e.desc)}">×</button></li>`;
        }).join("")
      : `<li class="empty">Brak wydatków. Dodaj pierwszy powyżej.</li>`;
    // totals
    const total = state.expenses.reduce((a, e) => a + e.amount, 0);
    countTo($("#total"), total);
    countTo($("#avg"), state.people.length ? Math.round(total / state.people.length) : 0);
    // balances
    const b = balances();
    const max = Math.max(1, ...Object.values(b).map(Math.abs));
    $("#balances").innerHTML = state.people.length
      ? state.people.map((p) => {
          const v = b[p.id];
          const w = (Math.abs(v) / max) * 50;
          const cls = v > 0 ? "p" : v < 0 ? "m" : "z";
          const bar = v === 0 ? "" : `<i class="${cls}" style="left:${v > 0 ? 50 : 50 - w}%;width:${w}%"></i>`;
          return `<li><span class="who">${av(p)}${esc(p.name)}</span><span class="bar">${bar}</span><span class="v ${cls}">${v > 0 ? "+" : ""}${fmt(v)}</span></li>`;
        }).join("")
      : `<li class="empty" style="color:rgba(255,255,255,.6)">Dodaj osoby, żeby zobaczyć bilans.</li>`;
    if (settled) renderSettle();
  }

  let lastSettle = "";
  function renderSettle() {
    const tr = settle();
    const card = $("#settleCard");
    card.hidden = false;
    const key = (t) => `${t.from}>${t.to}:${t.amount}`;
    state.done = state.done.filter((k) => tr.some((t) => key(t) === k));
    if (!tr.length) {
      $("#settleNote").textContent = "";
      $("#transfers").innerHTML = `<li class="kwita">Jesteście kwita! Nikt nikomu nic nie oddaje.</li>`;
      $("#copyBtn").hidden = true;
      lastSettle = "";
      return;
    }
    $("#copyBtn").hidden = false;
    const n = tr.length;
    const sig = JSON.stringify(tr);
    if (sig === lastSettle) return;
    lastSettle = sig;
    $("#settleNote").textContent = `${n} ${n === 1 ? "przelew" : n < 5 ? "przelewy" : "przelewów"} i jesteście kwita. Kliknij przelew, gdy zostanie oddany.`;
    $("#transfers").innerHTML = tr.map((t, i) => {
      const a = person(t.from), b = person(t.to), k = key(t);
      const done = state.done.includes(k);
      return `<li><button type="button" class="tr ${done ? "done" : ""}" data-done="${k}" style="animation-delay:${i * 90}ms" aria-pressed="${done}"><span class="chk">✓</span><span class="names">${av(a)}${esc(a.name)}<svg class="arrow" width="26" height="12" viewBox="0 0 26 12" aria-label="oddaje"><path d="M1 6h22M18 1l5 5-5 5" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>${av(b)}${esc(b.name)}</span><span class="amt2">${fmt(t.amount)}</span></button></li>`;
    }).join("");
  }

  // ---------- toast ----------
  let tt;
  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(tt);
    tt = setTimeout(() => el.classList.remove("show"), 2200);
  }
  const commit = () => { save(); render(); };

  // ---------- events ----------
  $("#trip").addEventListener("input", (e) => { state.trip = e.target.value; save(); });

  $("#personForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const inp = $("#personName");
    const name = inp.value.trim();
    if (!name) return;
    if (state.people.some((p) => p.name.toLowerCase() === name.toLowerCase())) { toast(`${name} już jest na liście`); return; }
    const used = new Set(state.people.map((p) => p.c));
    let c = 0; while (used.has(c) && c < COLORS.length) c++;
    const p = { id: "p" + Date.now().toString(36), name, c: c % COLORS.length };
    state.people.push(p);
    selFor.add(p.id);
    inp.value = "";
    commit();
  });

  $("#people").addEventListener("click", (e) => {
    const id = e.target.closest("[data-del-person]")?.dataset.delPerson;
    if (!id) return;
    const p = person(id);
    if (state.expenses.some((x) => x.payer === id || x.for.includes(id))) { toast(`${p.name} ma wydatki — najpierw je usuń`); return; }
    state.people = state.people.filter((x) => x.id !== id);
    commit();
  });

  $("#expFor").addEventListener("click", (e) => {
    const id = e.target.closest("[data-for]")?.dataset.for;
    if (!id) return;
    selFor.has(id) ? selFor.delete(id) : selFor.add(id);
    render();
  });
  $("#forAll").addEventListener("click", () => { selFor = new Set(state.people.map((p) => p.id)); render(); });

  $("#expForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const msg = $("#formMsg");
    const desc = $("#expDesc").value.trim();
    const amount = parseAmt($("#expAmt").value);
    const payer = $("#expPayer").value;
    const forIds = state.people.map((p) => p.id).filter((id) => selFor.has(id));
    if (!state.people.length) return (msg.textContent = "Najpierw dodaj osoby.");
    if (!desc) return (msg.textContent = "Wpisz, za co był wydatek.");
    if (!amount || amount <= 0) return (msg.textContent = "Wpisz poprawną kwotę, np. 120,50.");
    if (!forIds.length) return (msg.textContent = "Zaznacz, za kogo był wydatek.");
    msg.textContent = "";
    state.expenses.push({ id: "e" + Date.now().toString(36), desc, amount, payer, for: forIds });
    $("#expDesc").value = "";
    $("#expAmt").value = "";
    commit();
    toast(`Dodano: ${desc} · ${fmt(amount)}`);
  });

  $("#expList").addEventListener("click", (e) => {
    const id = e.target.closest("[data-del-exp]")?.dataset.delExp;
    if (!id) return;
    state.expenses = state.expenses.filter((x) => x.id !== id);
    commit();
  });

  $("#settleBtn").addEventListener("click", () => {
    if (!state.expenses.length) { toast("Dodaj najpierw jakiś wydatek"); return; }
    settled = true;
    lastSettle = "";
    renderSettle();
    const card = $("#settleCard");
    card.style.animation = "none"; void card.offsetWidth; card.style.animation = "";
    if (innerWidth <= 960) card.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  $("#transfers").addEventListener("click", (e) => {
    const k = e.target.closest("[data-done]")?.dataset.done;
    if (!k) return;
    const on = !state.done.includes(k);
    state.done = on ? [...state.done, k] : state.done.filter((x) => x !== k);
    save();
    const btn = e.target.closest("[data-done]");
    btn.classList.toggle("done", on);
    btn.setAttribute("aria-pressed", String(on));
    btn.style.animation = "none";
  });

  $("#copyBtn").addEventListener("click", async () => {
    const lines = settle().map((t) => `• ${person(t.from).name} → ${person(t.to).name}: ${fmt(t.amount).replace(/ /g, " ")}`);
    const total = state.expenses.reduce((a, e) => a + e.amount, 0);
    const text = `${state.trip || "Rozliczenie"} — rozliczenie z Kwita\nRazem: ${fmt(total).replace(/ /g, " ")}\n${lines.join("\n")}`;
    try { await navigator.clipboard.writeText(text); toast("Skopiowano — wklej na grupowy czat"); }
    catch (err) { toast("Nie udało się skopiować"); }
  });

  $("#loadDemo").addEventListener("click", () => {
    state = DEMO(); selFor = new Set(state.people.map((p) => p.id)); settled = false; $("#settleCard").hidden = true; commit(); toast("Wczytano przykład");
  });
  $("#clearAll").addEventListener("click", () => {
    state = { trip: "Nowe rozliczenie", people: [], expenses: [], done: [] }; selFor = new Set(); settled = false; $("#settleCard").hidden = true; commit();
  });

  render();
})();
