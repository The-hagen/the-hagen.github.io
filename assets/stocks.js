// Renders the stock model's published files. Every block is optional: a page
// includes the elements it wants and this fills whichever ones are present.
//
// Data contract (written by stock_project's quant/publish.py):
//   predictions-latest.json        newest monthly ranking
//   data/history.json              {months: [{month, file, generated_at}]}, newest first
//   data/predictions-YYYY-MM.json  one ranking per published month
(function () {
  "use strict";

  const TOP_N_FALLBACK = 10;
  const $ = (sel, root = document) => root.querySelector(sel);

  const monthName = (ym) => {
    const [y, m] = ym.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", {
      month: "long", year: "numeric", timeZone: "UTC",
    });
  };
  const shortMonth = (ym) => {
    const [y, m] = ym.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", {
      month: "short", year: "numeric", timeZone: "UTC",
    });
  };
  const dateLong = (iso) => new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Oslo",
  });
  const pct = (v) => (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(2) + "%";
  const tickerText = (t) => t.replace(/\.OL$/, "");

  async function getJSON(url) {
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) throw new Error(url + " returned " + res.status);
    return res.json();
  }

  // Bottom-n is defined by rank so it holds whatever the pipeline's top_n is.
  function groups(payload) {
    const rows = [...payload.rankings].sort((a, b) => a.rank - b.rank);
    const n = payload.top_n || TOP_N_FALLBACK;
    return { rows, n, top: rows.slice(0, n), bottom: rows.slice(-n).reverse() };
  }

  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === "class") node.className = v;
      else if (k === "text") node.textContent = v;
      else node.setAttribute(k, v);
    }
    for (const c of children) if (c !== null && c !== undefined) node.append(c);
    return node;
  }

  function moveCell(row) {
    if (row.prev_rank === null || row.prev_rank === undefined) {
      return el("span", { class: "move", text: "new this month" });
    }
    const d = row.prev_rank - row.rank;
    if (d === 0) return el("span", { class: "move", text: "unchanged" });
    const arrow = d > 0 ? "↑" : "↓";
    return el("span", {
      class: "move",
      "aria-label": (d > 0 ? "up " : "down ") + Math.abs(d) + " places, was " + row.prev_rank,
      text: arrow + " " + Math.abs(d) + " (was " + row.prev_rank + ")",
    });
  }

  function rankingTable(rows, caption, note) {
    const head = el("thead", {}, el("tr", {},
      el("th", { scope: "col", class: "r", text: "Rank" }),
      el("th", { scope: "col", text: "Ticker" }),
      el("th", { scope: "col", text: "Sector" }),
      el("th", { scope: "col", class: "r", text: "Forecast" }),
      el("th", { scope: "col", text: "Last month" }),
    ));
    const body = el("tbody");
    for (const r of rows) {
      body.append(el("tr", {},
        el("td", { class: "r num", text: String(r.rank) }),
        el("th", { scope: "row", class: "ticker", text: tickerText(r.ticker) }),
        el("td", { text: r.sector || "Unknown" }),
        el("td", { class: "r num " + (r.pred_return_pct >= 0 ? "pos" : "neg"), text: pct(r.pred_return_pct) }),
        el("td", {}, moveCell(r)),
      ));
    }
    const cap = el("caption", {}, caption, note ? el("small", { text: note }) : null);
    // Focusable so keyboard users can scroll it sideways on narrow screens.
    return el("div", { class: "table-scroll", tabindex: "0", role: "region", "aria-label": caption },
      el("table", {}, cap, head, body));
  }

  // ------------------------------------------------------------ hero strip
  function drawStrip(figure, payload, animate) {
    const { rows, n } = groups(payload);
    const width = Math.max(300, Math.round(figure.clientWidth));
    const r = width < 520 ? 4 : 5.5;
    const pad = { l: 8, r: 8 };
    const values = rows.map((d) => d.pred_return_pct);
    let lo = Math.min(...values), hi = Math.max(...values);
    const span = hi - lo || 1;
    lo -= span * 0.03; hi += span * 0.03;
    const x = (v) => pad.l + ((v - lo) / (hi - lo)) * (width - pad.l - pad.r);

    // Beeswarm: place each dot at the lowest free slot alternating above and
    // below the midline, so overlapping forecasts stay visible.
    const placed = [];
    const step = r * 2 + 1.5;
    const order = [...rows].sort((a, b) => a.pred_return_pct - b.pred_return_pct);
    let maxOff = 0;
    for (const d of order) {
      const cx = x(d.pred_return_pct);
      let k = 0, off = 0;
      for (;;) {
        off = (k % 2 === 0 ? 1 : -1) * Math.ceil(k / 2) * step;
        const clash = placed.some((p) => Math.abs(p.cx - cx) < step && Math.abs(p.off - off) < step - 0.1);
        if (!clash) break;
        k++;
      }
      placed.push({ d, cx, off });
      maxOff = Math.max(maxOff, Math.abs(off));
    }
    const mid = maxOff + r + 22;
    const height = mid + maxOff + r + 34;

    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("width", width);
    svg.setAttribute("height", height);
    svg.setAttribute("role", "img");
    const best = rows[0], worst = rows[rows.length - 1];
    svg.setAttribute("aria-label",
      `Forecast one-month return for ${rows.length} Oslo Børs stocks in ${monthName(payload.forecast_month)}, ` +
      `from ${pct(worst.pred_return_pct)} (${tickerText(worst.ticker)}) to ${pct(best.pred_return_pct)} (${tickerText(best.ticker)}). ` +
      `The same numbers are in the tables below.`);
    const mk = (tag, attrs) => {
      const node = document.createElementNS(ns, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
      return node;
    };

    // Axis with ticks every 1 or 2 percentage points, and a zero line.
    const axisY = height - 22;
    svg.append(mk("line", { class: "axis", x1: pad.l, x2: width - pad.r, y1: axisY, y2: axisY }));
    const tickStep = span > 6 ? 2 : 1;
    for (let t = Math.ceil(lo / tickStep) * tickStep; t <= hi; t += tickStep) {
      const g = mk("g", { class: "tick" });
      g.append(mk("line", { class: "axis", x1: x(t), x2: x(t), y1: t === 0 ? 8 : axisY - 4, y2: axisY + 4 }));
      const label = mk("text", { x: x(t), y: axisY + 18, "text-anchor": "middle" });
      label.textContent = (t > 0 ? "+" : t < 0 ? "−" : "") + Math.abs(t) + "%";
      g.append(label);
      svg.append(g);
    }

    const dots = mk("g", {});
    const hits = mk("g", {});
    placed.sort((a, b) => a.d.rank - b.d.rank);
    placed.forEach((p, i) => {
      const kind = p.d.rank <= n ? "up" : p.d.rank > rows.length - n ? "down" : "mid";
      const c = mk("circle", { class: "dot " + kind, cx: p.cx.toFixed(1), cy: (mid + p.off).toFixed(1), r });
      if (animate) c.style.setProperty("--d", Math.round((p.cx / width) * 700) + "ms");
      dots.append(c);
      const h = mk("circle", { class: "hit", cx: p.cx.toFixed(1), cy: (mid + p.off).toFixed(1), r: r + 6 });
      h.dataset.i = String(i);
      hits.append(h);
    });
    svg.append(dots, hits);

    // Direct labels on the two ends only.
    const endLabel = (row, anchor) => {
      const p = placed.find((q) => q.d === row);
      const t = mk("text", {
        class: "label strong",
        x: p.cx, y: mid - maxOff - r - 8,
        "text-anchor": anchor,
      });
      t.textContent = tickerText(row.ticker) + " " + pct(row.pred_return_pct);
      svg.append(t);
    };
    endLabel(best, "end");
    endLabel(worst, "start");

    figure.querySelector("svg")?.remove();
    figure.prepend(svg);
    figure.classList.toggle("animate", !!animate);

    // Hover layer: one tooltip, positioned in figure coordinates.
    let tip = figure.querySelector(".tooltip");
    if (!tip) { tip = el("div", { class: "tooltip", hidden: "" }); figure.append(tip); }
    const show = (evt) => {
      const target = evt.target.closest(".hit");
      if (!target) return;
      const p = placed[Number(target.dataset.i)];
      const scale = figure.clientWidth / width;
      tip.replaceChildren(
        el("strong", { text: tickerText(p.d.ticker) }),
        document.createTextNode(` ${p.d.sector || ""}`),
        el("br"),
        document.createTextNode(`Rank ${p.d.rank} of ${rows.length}, forecast ${pct(p.d.pred_return_pct)}`),
      );
      tip.style.left = p.cx * scale + "px";
      tip.style.top = (mid + p.off) * scale + "px";
      tip.hidden = false;
    };
    svg.addEventListener("pointerover", show);
    svg.addEventListener("pointerleave", () => { tip.hidden = true; });
  }

  // ------------------------------------------------------------ blocks
  function fillText(payload) {
    const { rows, top } = groups(payload);
    const sectors = {};
    for (const r of top) sectors[r.sector || "Unknown"] = (sectors[r.sector || "Unknown"] || 0) + 1;
    const sectorText = Object.entries(sectors).sort((a, b) => b[1] - a[1])
      .map(([s, c]) => `${s} ${c}`).join(", ");
    const values = {
      month: monthName(payload.forecast_month),
      "month-short": shortMonth(payload.forecast_month),
      count: String(rows.length),
      regime: payload.market_regime?.label && payload.market_regime.label !== "unknown"
        ? payload.market_regime.label : "not measured",
      published: dateLong(payload.generated_at),
      "top-sectors": sectorText,
    };
    document.querySelectorAll("[data-fill]").forEach((node) => {
      const v = values[node.dataset.fill];
      if (v !== undefined) node.textContent = v;
    });
  }

  function renderCurrent(payload) {
    const { top, bottom, n } = groups(payload);
    const topHost = $("#top-table"), bottomHost = $("#bottom-table");
    if (topHost) topHost.replaceChildren(rankingTable(top, `Top ${n}`, "Highest forecast return: this month's picks"));
    if (bottomHost) bottomHost.replaceChildren(rankingTable(bottom, `Bottom ${n}`, "Lowest forecast return, lowest first"));
  }

  function renderAll(payload) {
    const host = $("#all-table");
    if (!host) return;
    const { rows } = groups(payload);
    const search = $("#stock-search"), sector = $("#stock-sector"), count = $("#stock-count");
    const sectors = [...new Set(rows.map((r) => r.sector || "Unknown"))].sort();
    if (sector && sector.options.length <= 1) {
      for (const s of sectors) sector.append(el("option", { value: s, text: s }));
    }
    const draw = () => {
      const q = (search?.value || "").trim().toUpperCase();
      const s = sector?.value || "";
      const shown = rows.filter((r) =>
        (!q || r.ticker.toUpperCase().includes(q)) && (!s || (r.sector || "Unknown") === s));
      host.replaceChildren(rankingTable(shown, "All ranked stocks", null));
      if (count) count.textContent = `Showing ${shown.length} of ${rows.length} stocks`;
    };
    search?.addEventListener("input", draw);
    sector?.addEventListener("change", draw);
    draw();
  }

  async function renderHistory(history, latest) {
    const host = $("#history");
    if (!host) return;
    const picker = $("#month-picker"), out = $("#history-tables"), changes = $("#history-changes");
    const months = history?.months?.length ? history.months
      : [{ month: latest.forecast_month, file: null }];
    const cache = new Map([[latest.forecast_month, latest]]);
    const load = async (m) => {
      if (!cache.has(m.month)) cache.set(m.month, await getJSON(m.file));
      return cache.get(m.month);
    };

    const select = async (idx) => {
      picker.querySelectorAll("button").forEach((b, i) => b.setAttribute("aria-pressed", String(i === idx)));
      out.replaceChildren(el("p", { class: "status", text: "Loading " + monthName(months[idx].month) + "…" }));
      try {
        const payload = await load(months[idx]);
        const { top, bottom, n } = groups(payload);
        out.replaceChildren(el("div", { class: "pair" },
          rankingTable(top, `Top ${n}, ${monthName(payload.forecast_month)}`, `Published ${dateLong(payload.generated_at)}`),
          rankingTable(bottom, `Bottom ${n}, ${monthName(payload.forecast_month)}`, "Lowest first"),
        ));
        const older = months[idx + 1];
        changes.replaceChildren();
        if (older) {
          const prev = await load(older);
          const prevTop = new Set(groups(prev).top.map((r) => r.ticker));
          const nowTop = new Set(top.map((r) => r.ticker));
          const entered = [...nowTop].filter((t) => !prevTop.has(t)).map(tickerText);
          const left = [...prevTop].filter((t) => !nowTop.has(t)).map(tickerText);
          changes.append(
            el("p", {}, el("strong", { text: "New in the top " + n + ": " }), entered.length ? entered.join(", ") : "none"),
            el("p", {}, el("strong", { text: "Dropped out since " + monthName(older.month) + ": " }), left.length ? left.join(", ") : "none"),
          );
        } else {
          changes.append(el("p", { class: "muted", text: "This is the first published month, so there is nothing to compare it with." }));
        }
      } catch (err) {
        out.replaceChildren(el("p", { class: "status error", text: "Could not load this month's file (" + err.message + "). The other months still work." }));
      }
    };

    picker.replaceChildren(...months.map((m, i) => {
      const b = el("button", { type: "button", class: "button small", "aria-pressed": "false", text: monthName(m.month) });
      b.addEventListener("click", () => select(i));
      return b;
    }));
    await select(0);
  }

  function renderStrip(payload) {
    const figure = $("#forecast-strip");
    if (!figure) return;
    const animate = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    drawStrip(figure, payload, animate);
    let lastW = figure.clientWidth, timer;
    new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (Math.abs(figure.clientWidth - lastW) > 8) { lastW = figure.clientWidth; drawStrip(figure, payload, false); }
      }, 120);
    }).observe(figure);
  }

  function showError(message) {
    document.querySelectorAll("[data-stock-status]").forEach((node) => {
      node.textContent = message;
      node.classList.add("error");
      node.hidden = false;
    });
  }

  async function main() {
    if (!document.querySelector("[data-stock-status]")) return;
    const [latestRes, historyRes] = await Promise.allSettled([
      getJSON("predictions-latest.json"),
      getJSON("data/history.json"),
    ]);
    const history = historyRes.status === "fulfilled" ? historyRes.value : null;
    let latest = latestRes.status === "fulfilled" ? latestRes.value : null;
    if (!latest && history?.months?.length) {
      try { latest = await getJSON(history.months[0].file); } catch (_) { /* reported below */ }
    }
    if (!latest || !Array.isArray(latest.rankings) || !latest.rankings.length) {
      showError("The ranking file could not be loaded, so the live tables are empty. The description of the model below is unaffected.");
      return;
    }
    document.querySelectorAll("[data-stock-status]").forEach((n) => { n.hidden = true; });
    fillText(latest);
    renderStrip(latest);
    renderCurrent(latest);
    renderAll(latest);
    await renderHistory(history, latest);
    document.documentElement.dataset.stocksReady = "true";
  }

  main();
})();
