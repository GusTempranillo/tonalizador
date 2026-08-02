/* ============================================================
   Tonalizador · Tutorial interactivo
   chapters.js — Los experimentos interactivos de cada capítulo
   ============================================================ */
"use strict";

/* Almacén tolerante a fallos: si el navegador no permite guardar
   (modo privado, restricciones de file://), la web sigue funcionando
   exactamente igual, solo que sin memoria entre visitas. */
window.Store = (() => {
  let ok = true;
  try {
    const probe = "__tonalizador_probe__";
    localStorage.setItem(probe, "1");
    localStorage.removeItem(probe);
  } catch (_) {
    ok = false;
  }
  return {
    available: ok,
    get(key, fallback = null) {
      if (!ok) return fallback;
      try {
        const raw = localStorage.getItem(key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch (_) {
        return fallback;
      }
    },
    set(key, value) {
      if (!ok) return false;
      try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch (_) {
        return false;
      }
    },
  };
})();

(() => {
  const T = window.Theory;
  const AE = window.AudioEngine;
  const AP = window.AudioPhrases;
  const Store = window.Store;
  const $ = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));

  /* ════════════════════════════════════════════════════════
     Utilidad: piano reutilizable
     ════════════════════════════════════════════════════════ */

  const WHITE_PCS = [0, 2, 4, 5, 7, 9, 11];
  const BLACK_AFTER = { 0: 1, 2: 3, 5: 6, 7: 8, 9: 10 }; // pc blanco → pc negro siguiente

  function makePiano(container, { startMidi = 60, whiteCount = 10, labels = true } = {}) {
    container.innerHTML = "";
    const keys = new Map();
    const whites = [];
    let midi = startMidi;
    while (whites.length < whiteCount) {
      if (WHITE_PCS.includes(midi % 12)) whites.push(midi);
      midi++;
    }
    const whiteW = 100 / whiteCount;
    whites.forEach((m, i) => {
      const el = document.createElement("button");
      el.type = "button";
      el.className = "key-white";
      el.dataset.midi = m;
      el.setAttribute("aria-label", `Tecla ${T.NOTE_ES[T.PITCH_CLASSES[m % 12]]}`);
      if (labels) el.textContent = T.NOTE_ES[T.PITCH_CLASSES[m % 12]];
      container.appendChild(el);
      keys.set(m, el);
      const blackPc = BLACK_AFTER[m % 12];
      if (blackPc !== undefined && i < whiteCount - 1) {
        const bm = m + 1;
        const bl = document.createElement("button");
        bl.type = "button";
        bl.className = "key-black";
        bl.dataset.midi = bm;
        bl.setAttribute("aria-label", `Tecla ${T.NOTE_ES[T.PITCH_CLASSES[bm % 12]]}`);
        if (labels) bl.textContent = T.NOTE_ES[T.PITCH_CLASSES[bm % 12]].replace("♯", "♯");
        bl.style.left = `calc(${(i + 1) * whiteW}% - 3.1%)`;
        container.appendChild(bl);
        keys.set(bm, bl);
      }
    });

    container.addEventListener("pointerdown", e => {
      const k = e.target.closest("[data-midi]");
      if (!k) return;
      const m = parseInt(k.dataset.midi, 10);
      AE.playNote(m, { duration: 0.9 });
      flash(m);
    });
    container.addEventListener("keydown", e => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const k = e.target.closest("[data-midi]");
      if (!k) return;
      e.preventDefault();
      const m = parseInt(k.dataset.midi, 10);
      AE.playNote(m, { duration: 0.9 });
      flash(m);
    });

    /* Un temporizador por tecla: si la misma nota vuelve a sonar antes de apagarse,
       el temporizador viejo ya no puede apagar el destello nuevo. */
    const flashTimers = new Map();
    /* 560 ms por defecto: al pulsar a mano, la nota suena 0,9 s — un destello
       de 420 ms se apagaba mucho antes de que la tecla dejara de sonar. */
    function flash(m, ms = 560) {
      const el = keys.get(m) ?? keys.get(60 + (m % 12));
      if (!el) return;
      clearTimeout(flashTimers.get(el));
      el.classList.add("active");
      flashTimers.set(el, setTimeout(() => {
        el.classList.remove("active");
        flashTimers.delete(el);
      }, ms));
    }

    function paintScale(pcSet, tonicPc) {
      for (const [m, el] of keys) {
        const pc = m % 12;
        el.classList.toggle("in-scale", pcSet.has(pc) && pc !== tonicPc);
        el.classList.toggle("tonic", pc === tonicPc);
      }
    }

    return { keys, flash, paintScale };
  }

  /* ════════════════════════════════════════════════════════
     HERO — constelación de 12 notas + botón de escucha
     ════════════════════════════════════════════════════════ */

  function initHero() {
    const canvas = $("#hero-canvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let W, H, t = 0;
    let pulse = new Array(12).fill(0);

    function resize() {
      const r = canvas.getBoundingClientRect();
      canvas.width = r.width * devicePixelRatio;
      canvas.height = r.height * devicePixelRatio;
      W = canvas.width; H = canvas.height;
    }
    resize();
    window.addEventListener("resize", resize);

    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

    function draw() {
      ctx.clearRect(0, 0, W, H);
      const cx = W / 2, cy = H * 0.5;
      const R = Math.min(W, H) * 0.4;
      // estrella central (la tónica, el hogar)
      const glow = 0.6 + 0.4 * Math.sin(t * 0.02);
      ctx.beginPath();
      ctx.arc(cx, cy, 7 * devicePixelRatio + glow * 3, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,184,107,0.95)";
      ctx.shadowColor = "rgba(255,184,107,0.9)";
      ctx.shadowBlur = 30 * glow;
      ctx.fill();
      ctx.shadowBlur = 0;
      // 12 notas en órbita
      for (let pc = 0; pc < 12; pc++) {
        const a = (pc / 12) * Math.PI * 2 - Math.PI / 2 + t * 0.0012;
        const wob = Math.sin(t * 0.01 + pc) * 6 * devicePixelRatio;
        const x = cx + Math.cos(a) * (R + wob);
        const y = cy + Math.sin(a) * (R * 0.88 + wob);
        const p = pulse[pc];
        ctx.beginPath();
        ctx.arc(x, y, (3.2 + p * 6) * devicePixelRatio, 0, Math.PI * 2);
        ctx.fillStyle = T.pitchColor(pc, 0.55 + p * 0.45);
        ctx.shadowColor = T.pitchColor(pc, 0.9);
        ctx.shadowBlur = p * 26;
        ctx.fill();
        ctx.shadowBlur = 0;
        // hilo de gravedad hacia el hogar
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(cx, cy);
        ctx.strokeStyle = `rgba(139,124,255,${0.035 + p * 0.3})`;
        ctx.lineWidth = 1 * devicePixelRatio;
        ctx.stroke();
        pulse[pc] = Math.max(0, p - 0.02);
      }
      t++;
      if (!reduced) requestAnimationFrame(draw);
    }
    draw();
    if (reduced) { t = 40; draw(); }

    $("#hero-listen")?.addEventListener("click", () => {
      const ev = AP.progressionEvents(0, 1, [0, 3, 4, 0], { beat: 0.72 });
      AE.playSequence(ev, {
        onStep: e => { (e.triad || []).forEach(m => { pulse[m % 12] = 1; }); pulse[0] = 1; },
      });
    });
  }

  /* ════════════════════════════════════════════════════════
     EXP 1 — Playlists: azar vs ordenada
     ════════════════════════════════════════════════════════ */

  function initPlaylistDemo() {
    const data = {
      random: [
        { name: "Aurora", key: "C", pc: 0, mode: 1, cam: "8B" },
        { name: "Medianoche", key: "F#", pc: 6, mode: 1, cam: "2B" },
        { name: "Deriva", key: "D#m", pc: 3, mode: 0, cam: "2A" },
      ],
      sorted: [
        { name: "Aurora", key: "C", pc: 0, mode: 1, cam: "8B" },
        { name: "Brisa", key: "G", pc: 7, mode: 1, cam: "9B" },
        { name: "Vela", key: "Em", pc: 4, mode: 0, cam: "9A" },
      ],
    };
    for (const [id, list] of Object.entries(data)) {
      const body = $(`#pl-${id} .pl-body`);
      if (!body) return;
      list.forEach(s => {
        const row = document.createElement("div");
        row.className = "pl-song";
        row.innerHTML = `<span class="dot" style="background:${T.pitchColor(s.pc)};color:${T.pitchColor(s.pc)}"></span>
          <span>${s.name}</span><span class="meta">${T.keyToSpanish(s.key)} · ${s.cam}</span>`;
        body.appendChild(row);
      });
    }
    $$("#c-problema [data-play]").forEach(btn => {
      btn.addEventListener("click", () => {
        const list = data[btn.dataset.play];
        const rows = $$(`#pl-${btn.dataset.play} .pl-song`);
        const events = [];
        list.forEach((s, i) => {
          const base = i * 2.0;
          const prog = s.mode === 1 ? [0, 4] : [0, 5];
          prog.forEach((deg, j) => {
            const tr = T.triadOnDegree(s.pc, s.mode, deg, 3);
            events.push({ midis: [tr[0] - 12, ...tr], at: base + j * 0.9, dur: 1.15, vel: 0.8, song: i });
          });
        });
        rows.forEach(r => r.classList.remove("playing"));
        AE.playSequence(events, {
          onStep: e => rows.forEach((r, i) => r.classList.toggle("playing", i === e.song)),
          onEnd: () => rows.forEach(r => r.classList.remove("playing")),
        });
      });
    });
  }

  /* ════════════════════════════════════════════════════════
     EXP 2 — Gravedad musical (melodía que resuelve o no)
     ════════════════════════════════════════════════════════ */

  function initHomeMelody() {
    const piano = makePiano($("#piano-home"));
    piano.paintScale(new Set(T.scaleOf(0, 1)), 0);
    function play(resolve) {
      const ev = AP.homeMelody(0, { resolve });
      AE.playSequence(ev, { onStep: e => piano.flash(e.midis[0], e.isLast ? 1400 : 320) });
    }
    $("#melody-resolve")?.addEventListener("click", () => play(true));
    $("#melody-suspend")?.addEventListener("click", () => play(false));
  }

  /* ════════════════════════════════════════════════════════
     EXP 3 — Mayor / menor (sol y nubes)
     ════════════════════════════════════════════════════════ */

  function initMoodDemo() {
    let mode = 1;
    const bMaj = $("#mode-major"), bMin = $("#mode-minor");
    const caption = $("#mode-caption");
    function setMode(m) {
      mode = m;
      bMaj.setAttribute("aria-pressed", String(m === 1));
      bMin.setAttribute("aria-pressed", String(m === 0));
      const sun = $("#mood-sun"), rays = $("#mood-rays"), clouds = $("#mood-clouds");
      const top = $("#sky-top"), bottom = $("#sky-bottom");
      if (window.gsap) {
        gsap.to(sun, { attr: { cy: m === 1 ? 70 : 92 }, opacity: m === 1 ? 0.95 : 0.55, duration: 0.9, ease: "power2.inOut" });
        gsap.to(rays, { opacity: m === 1 ? 1 : 0, duration: 0.7 });
        gsap.to(clouds, { opacity: m === 1 ? 0 : 0.92, duration: 0.9 });
      } else {
        sun.setAttribute("cy", m === 1 ? 70 : 92);
        sun.setAttribute("opacity", m === 1 ? 0.95 : 0.55);
        rays.setAttribute("opacity", m === 1 ? 1 : 0);
        clouds.setAttribute("opacity", m === 1 ? 0 : 0.92);
      }
      top.setAttribute("stop-color", m === 1 ? "#2b3a67" : "#1a2033");
      caption.textContent = m === 1
        ? "Modo Mayor: la tercera y la sexta notas de la escala están en su posición «alta». La luz entra de lleno."
        : "Modo menor: la tercera y la sexta bajan medio escalón. Mismo paisaje, cielo cubierto.";
    }
    bMaj?.addEventListener("click", () => setMode(1));
    bMin?.addEventListener("click", () => setMode(0));
    $("#mode-play")?.addEventListener("click", () => {
      const base = 72;
      const degreesMaj = [0, 2, 4, 5, 4, 2, 0];
      const steps = mode === 1 ? T.MAJOR_STEPS : T.MINOR_STEPS;
      const ev = degreesMaj.map((d, i) => ({
        midis: [base + steps[d]], at: i * 0.42, dur: i === degreesMaj.length - 1 ? 1.6 : 0.62, vel: 0.8,
      }));
      // acorde final
      const tr = T.triadOnDegree(0, mode, 0, 4);
      ev.push({ midis: [tr[0] - 12, ...tr], at: degreesMaj.length * 0.42 + 0.1, dur: 2.2, vel: 0.85 });
      AE.playSequence(ev);
    });
  }

  /* ════════════════════════════════════════════════════════
     EXP 4 — Constructor de escalas
     ════════════════════════════════════════════════════════ */

  function initScaleBuilder() {
    const piano = makePiano($("#piano-scale"));
    const tonicsWrap = $("#scale-tonics");
    let tonic = 0, mode = 1;
    T.PITCH_CLASSES.forEach((pcName, pc) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = T.NOTE_ES[pcName];
      b.setAttribute("aria-pressed", String(pc === 0));
      b.addEventListener("click", () => { tonic = pc; update(); });
      tonicsWrap.appendChild(b);
    });
    const bMaj = $("#scale-major"), bMin = $("#scale-minor");
    bMaj.addEventListener("click", () => { mode = 1; update(); });
    bMin.addEventListener("click", () => { mode = 0; update(); });

    function update() {
      Array.from(tonicsWrap.children).forEach((b, i) => b.setAttribute("aria-pressed", String(i === tonic)));
      bMaj.setAttribute("aria-pressed", String(mode === 1));
      bMin.setAttribute("aria-pressed", String(mode === 0));
      piano.paintScale(new Set(T.scaleOf(tonic, mode)), tonic);
      const keyOf = T.keyLabel(tonic, mode);
      $("#scale-name").textContent = `${T.keyToSpanish(keyOf)} · ${keyOf} · ${T.keyToCamelot(keyOf)}`;
    }
    update();

    $("#scale-play").addEventListener("click", () => {
      const ev = AP.scaleEvents(tonic, mode);
      AE.playSequence(ev, { onStep: e => piano.flash(e.midis[0], 300) });
    });
  }

  /* ════════════════════════════════════════════════════════
     EXP 5 — Rueda Camelot
     ════════════════════════════════════════════════════════ */

  function initCamelotWheel() {
    const svg = $("#camelot-svg");
    if (!svg) return;
    const NS = "http://www.w3.org/2000/svg";
    const cx = 220, cy = 220;
    const camelotToKey = {};
    for (const [k, v] of Object.entries(T.CAMELOT_BY_KEY)) camelotToKey[v] = k;
    const cells = new Map();
    let selected = null;

    function sector(rIn, rOut, a0, a1) {
      const p = (r, a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
      const [x0, y0] = p(rOut, a0), [x1, y1] = p(rOut, a1);
      const [x2, y2] = p(rIn, a1), [x3, y3] = p(rIn, a0);
      return `M${x0},${y0} A${rOut},${rOut} 0 0 1 ${x1},${y1} L${x2},${y2} A${rIn},${rIn} 0 0 0 ${x3},${y3} Z`;
    }

    for (let n = 1; n <= 12; n++) {
      for (const letter of ["B", "A"]) {
        const code = `${n}${letter}`;
        const keyOf = camelotToKey[code];
        const pc = T.PITCH_CLASSES.indexOf(keyOf.replace("m", ""));
        const a0 = ((n - 1) / 12) * Math.PI * 2 - Math.PI / 2 - Math.PI / 12;
        const a1 = a0 + Math.PI * 2 / 12;
        const rIn = letter === "B" ? 150 : 88;
        const rOut = letter === "B" ? 214 : 150;
        const g = document.createElementNS(NS, "g");
        g.setAttribute("class", "wheel-cell");
        g.setAttribute("tabindex", "0");
        g.setAttribute("role", "button");
        g.setAttribute("aria-label", `${T.keyToSpanish(keyOf)}, código ${code}`);
        const path = document.createElementNS(NS, "path");
        path.setAttribute("d", sector(rIn, rOut, a0, a1));
        path.setAttribute("fill", T.pitchColor(pc, letter === "B" ? 0.32 : 0.18));
        path.setAttribute("stroke", "rgba(255,255,255,0.12)");
        g.appendChild(path);
        const mid = (a0 + a1) / 2, rm = (rIn + rOut) / 2;
        const t1 = document.createElementNS(NS, "text");
        t1.setAttribute("x", cx + rm * Math.cos(mid));
        t1.setAttribute("y", cy + rm * Math.sin(mid) - 4);
        t1.setAttribute("text-anchor", "middle");
        t1.setAttribute("fill", "#e8eaf2");
        t1.setAttribute("font-size", "15");
        t1.setAttribute("font-weight", "800");
        t1.textContent = code;
        const t2 = document.createElementNS(NS, "text");
        t2.setAttribute("x", cx + rm * Math.cos(mid));
        t2.setAttribute("y", cy + rm * Math.sin(mid) + 12);
        t2.setAttribute("text-anchor", "middle");
        t2.setAttribute("fill", "rgba(232,234,242,0.75)");
        t2.setAttribute("font-size", "10.5");
        t2.textContent = T.NOTE_ES[keyOf.replace("m", "")] + (letter === "A" ? "m" : "");
        g.appendChild(t1); g.appendChild(t2);
        const pick = () => select(code);
        g.addEventListener("click", pick);
        g.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } });
        svg.appendChild(g);
        cells.set(code, { g, path, keyOf, pc, letter });
      }
    }
    const center = document.createElementNS(NS, "text");
    center.setAttribute("x", cx); center.setAttribute("y", cy + 4);
    center.setAttribute("text-anchor", "middle");
    center.setAttribute("fill", "rgba(167,171,189,0.8)");
    center.setAttribute("font-size", "12");
    center.textContent = "B = Mayor · A = menor";
    svg.appendChild(center);

    function select(code) {
      selected = code;
      const info = cells.get(code);
      const neighbors = T.camelotNeighbors(code);
      for (const [c, cell] of cells) {
        const isSel = c === code, isNb = neighbors.includes(c);
        cell.path.setAttribute("stroke", isSel ? "#fff" : isNb ? "rgba(76,201,240,0.9)" : "rgba(255,255,255,0.12)");
        cell.path.setAttribute("stroke-width", isSel ? "3" : isNb ? "2" : "1");
        cell.path.setAttribute("fill", T.pitchColor(cell.pc, isSel ? 0.85 : isNb ? 0.5 : (cell.letter === "B" ? 0.14 : 0.08)));
      }
      $("#wheel-name").textContent = T.keyToSpanish(info.keyOf);
      $("#wheel-sub").textContent = `Combina con ${neighbors.join(", ")} — misma casilla, letra opuesta o número vecino.`;
      $("#wheel-badges").innerHTML =
        `<span class="chip acc">${info.keyOf}</span><span class="chip acc">${code}</span>` +
        neighbors.map(n => `<span class="chip ok">vecina ${n} · ${T.keyToSpanish(camelotToKey[n])}</span>`).join("");
      ["#wheel-play", "#wheel-play-good", "#wheel-play-bad"].forEach(s => $(s).disabled = false);
      $("#wheel-verdict").textContent = "";
    }

    function modeOf(cell) { return cell.letter === "B" ? 1 : 0; }

    $("#wheel-play").addEventListener("click", () => {
      const c = cells.get(selected);
      AE.playSequence(AP.progressionEvents(c.pc, modeOf(c), [0, 3, 4, 0], { beat: 0.58 }));
    });
    $("#wheel-play-good").addEventListener("click", () => {
      const c = cells.get(selected);
      const nb = cells.get(T.camelotNeighbors(selected)[2] || T.camelotNeighbors(selected)[0]);
      const ev = [
        ...AP.progressionEvents(c.pc, modeOf(c), [0, 4], { beat: 0.62 }),
        ...AP.progressionEvents(nb.pc, modeOf(nb), [0, 3], { beat: 0.62 }).map(e => ({ ...e, at: e.at + 1.35 })),
      ];
      AE.playSequence(ev);
      $("#wheel-verdict").textContent = `De ${selected} a ${T.keyToCamelot(nb.keyOf)}: familias casi idénticas de notas — la transición aterriza con suavidad.`;
    });
    $("#wheel-play-bad").addEventListener("click", () => {
      const c = cells.get(selected);
      const m = selected.match(/^(\d+)([AB])$/);
      const farCode = `${((parseInt(m[1], 10) + 5) % 12) + 1}${m[2]}`;
      const far = cells.get(farCode);
      const ev = [
        ...AP.progressionEvents(c.pc, modeOf(c), [0, 4], { beat: 0.62 }),
        ...AP.progressionEvents(far.pc, modeOf(far), [0, 3], { beat: 0.62 }).map(e => ({ ...e, at: e.at + 1.35 })),
      ];
      AE.playSequence(ev);
      $("#wheel-verdict").textContent = `De ${selected} a ${farCode}: apenas comparten notas — el salto se nota como un cambio de habitación brusco.`;
    });

    select("8A");
  }

  /* ════════════════════════════════════════════════════════
     EXP 6 — Pipeline: el viaje de una canción
     ════════════════════════════════════════════════════════ */

  function initPipeline() {
    const picker = $("#pipeline-picker");
    if (!picker) return;
    const stations = $$("#pipeline .station");
    const dot = $("#travel-dot");
    const resultCard = $("#pipeline-result");
    const cacheMemory = new Set();
    let running = false;

    T.DEMO_SONGS.forEach((s, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "song-pill";
      b.textContent = `${s.title} — ${s.artist.split(" ").slice(0, 2).join(" ")}`;
      b.setAttribute("aria-pressed", "false");
      b.addEventListener("click", () => { if (!running) run(s, b); });
      picker.appendChild(b);
    });

    const sleep = ms => new Promise(r => setTimeout(r, ms));

    function setStation(el, state, statusText, cls) {
      el.classList.remove("active", "done", "skipped", "failed");
      if (state) el.classList.add(state);
      const st = el.querySelector(".status");
      st.innerHTML = statusText ? `<span class="chip ${cls || ""}">${statusText}</span>` : "";
    }

    function moveDotTo(el) {
      const pipe = $("#pipeline").getBoundingClientRect();
      const r = el.getBoundingClientRect();
      dot.style.opacity = "1";
      dot.style.top = `${r.top - pipe.top + r.height / 2 - 5}px`;
    }

    async function run(song, btn) {
      running = true;
      $$("#pipeline-picker .song-pill").forEach(b => b.setAttribute("aria-pressed", String(b === btn)));
      resultCard.classList.remove("show");
      stations.forEach(s => setStation(s, null, ""));
      const [stCache, stSpotify, stRecco, stLocal] = stations;
      const inCache = cacheMemory.has(song.id);

      // 1 · caché
      setStation(stCache, "active", "consultando…");
      moveDotTo(stCache);
      await sleep(inCache ? 550 : 900);
      if (inCache) {
        setStation(stCache, "done", "¡encontrada! ⚡", "ok");
        [stSpotify, stRecco, stLocal].forEach(s => setStation(s, "skipped", "no hace falta"));
        showResult(song, { source: "Memoria compartida", cached: true });
        running = false;
        return;
      }
      setStation(stCache, "failed", "aún no está", "warn");

      // 2 · Spotify
      setStation(stSpotify, "active", "buscando la grabación…");
      moveDotTo(stSpotify);
      await sleep(1300);
      if (song.id === "desconocida") {
        setStation(stSpotify, "failed", "varias ediciones dudosas", "warn");
      } else {
        setStation(stSpotify, "done", "grabación identificada", "ok");
      }

      // 3 · ReccoBeats
      setStation(stRecco, "active", "pidiendo la ficha…");
      moveDotTo(stRecco);
      await sleep(1300);
      if (song.keyOf) {
        setStation(stRecco, "done", `tonalidad: ${song.keyOf}`, "ok");
        setStation(stLocal, "skipped", "no hace falta");
        cacheMemory.add(song.id);
        showResult(song, { source: "ReccoBeats", cached: false });
      } else {
        setStation(stRecco, "failed", "sin dato fiable", "warn");
        setStation(stLocal, "active", "se ofrece a tu elección", "acc");
        moveDotTo(stLocal);
        await sleep(700);
        showResult(song, { source: null, cached: false });
      }
      running = false;
    }

    function showResult(song, { source, cached }) {
      dot.style.opacity = "0";
      if (!song.keyOf) {
        resultCard.innerHTML = `
          <strong>Resultado honesto: sin clasificar → a revisión 📝</strong>
          <p style="color:var(--text-dim);font-size:14.5px;margin:8px 0 0">${song.note}
          En la app real, junto a esta fila (y solo a esta) aparecería el botón <strong>«Analizar audio»</strong>
          para examinarla localmente, y la canción iría a <span class="mono">revisar.csv</span> en vez de colarse
          en una lista equivocada.</p>`;
      } else {
        resultCard.innerHTML = `
          <strong>${song.title} — ${song.artist}</strong>
          <div class="result-grid">
            <div class="result-item"><div class="lbl">Tonalidad</div><div class="val big">${T.keyToSpanish(song.keyOf)}</div></div>
            <div class="result-item"><div class="lbl">Notación</div><div class="val">${song.keyOf}</div></div>
            <div class="result-item"><div class="lbl">Camelot</div><div class="val">${T.keyToCamelot(song.keyOf)}</div></div>
            <div class="result-item"><div class="lbl">BPM</div><div class="val">${song.bpm}</div></div>
            <div class="result-item"><div class="lbl">Fuente</div><div class="val">${source}</div></div>
            <div class="result-item"><div class="lbl">Caché</div><div class="val">${cached ? "Sí ⚡" : "No (primera vez)"}</div></div>
          </div>
          ${song.note ? `<p style="color:var(--text-dim);font-size:13.5px;margin:12px 0 0">ℹ️ ${song.note}</p>` : ""}
          ${!cached ? `<p style="color:var(--text-faint);font-size:13.5px;margin:10px 0 0">💡 Vuelve a pulsar la misma canción: ahora la memoria compartida responderá al instante.</p>` : ""}`;
      }
      resultCard.classList.add("show");
    }
  }

  /* ════════════════════════════════════════════════════════
     EXP 7 — Tú eres el algoritmo (matching)
     ════════════════════════════════════════════════════════ */

  function initMatching() {
    const wrap = $("#match-cases");
    if (!wrap) return;
    const cases = [
      {
        csv: "Hotel California — Eagles",
        cand: "Hotel California — Eagles (álbum «Hotel California», 1976)",
        pass: true,
        rule: "Coincidencia exacta de título y artista → continúa automáticamente. Es la regla <span class='mono'>metadata_exact_title_artist</span>: cuando el DNI coincide letra a letra, no hay motivo de sospecha.",
      },
      {
        csv: "Let It Be — The Beatles",
        cand: "Let It Be (2009 Remaster) — The Beatles",
        pass: true,
        rule: "Remasterización equivalente → continúa. Es la misma grabación con el sonido pulido: la tonalidad no cambia por limpiar el cristal. Regla <span class='mono'>metadata_remaster_equivalent</span>.",
      },
      {
        csv: "Hotel California — Eagles",
        cand: "Hotel California (Live on MTV, 1994) — Eagles",
        pass: false,
        rule: "Un directo <strong>nunca pasa solo</strong>: puede estar en otro tono (este caso es célebre: el directo de 1994 está en otra tonalidad que el estudio). Va a revisión, y la última palabra es tuya.",
      },
      {
        csv: "Hallelujah — Leonard Cohen",
        cand: "Hallelujah — Jeff Buckley",
        pass: false,
        rule: "Artista distinto = grabación distinta, aunque el título sea idéntico. Los covers cambian de tono constantemente. A revisión sin contemplaciones.",
      },
    ];
    cases.forEach(c => {
      const el = document.createElement("div");
      el.className = "match-case";
      el.innerHTML = `
        <p class="q">Tu playlist dice: <span class="mono">${c.csv}</span></p>
        <p class="vs">El catálogo ofrece: <span class="mono">${c.cand}</span></p>
        <div class="btn-row">
          <button class="btn" data-choice="pass" type="button">✅ Dejar pasar</button>
          <button class="btn" data-choice="review" type="button">🔍 A revisión</button>
          <span class="chip" style="display:none"></span>
        </div>
        <p class="expl">${c.rule}</p>`;
      wrap.appendChild(el);
      const chip = el.querySelector(".chip");
      el.querySelectorAll("[data-choice]").forEach(b => {
        b.addEventListener("click", () => {
          const said = b.dataset.choice === "pass";
          const right = said === c.pass;
          chip.style.display = "inline-flex";
          chip.className = `chip ${right ? "ok" : "bad"}`;
          chip.textContent = right ? "¡Coincides con la herramienta!" : `La herramienta decide: ${c.pass ? "dejar pasar" : "a revisión"}`;
          el.querySelector(".expl").classList.add("show");
          el.querySelectorAll("[data-choice]").forEach(x => x.disabled = true);
        });
      });
    });
  }

  /* ════════════════════════════════════════════════════════
     EXP 8 — Laboratorio acústico en vivo
     ════════════════════════════════════════════════════════ */

  function initLab() {
    const picker = $("#lab-picker");
    if (!picker) return;
    const waveC = $("#lab-wave"), chromaC = $("#lab-chroma"), rankC = $("#lab-rank");
    const runBtn = $("#lab-run"), stopBtn = $("#lab-stop");
    const confPanel = $("#lab-confidence");
    const steps = $$(".lab-step");
    let sample = null, raf = 0, cancel = null;
    let chroma = new Array(12).fill(0);
    let rankAnim = null;
    let lastRanked = null;
    let lastW = 0;

    const SAMPLES = [
      { id: "g", name: "Balada en Sol Mayor", pc: 7, mode: 1, degrees: [0, 3, 4, 0, 5, 3, 4, 0] },
      { id: "em", name: "Tema en Mi menor", pc: 4, mode: 0, degrees: [0, 5, 3, 4, 0, 5, 4, 0] },
      { id: "amb", name: "Caso ambiguo (primas hermanas)", pc: 9, mode: 0, degrees: null, ambiguous: true },
      { id: "noise", name: "Lluvia (sin música)", noise: true },
    ];

    SAMPLES.forEach((s, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "song-pill";
      b.textContent = s.name;
      b.setAttribute("aria-pressed", String(i === 0));
      b.addEventListener("click", () => {
        sample = s;
        $$("#lab-picker .song-pill").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
      });
      picker.appendChild(b);
    });
    sample = SAMPLES[0];

    function fitCanvas(c) {
      const r = c.getBoundingClientRect();
      c.width = r.width * devicePixelRatio;
      c.height = parseInt(c.getAttribute("height"), 10) * devicePixelRatio;
    }

    function setStep(n) { steps.forEach((s, i) => s.classList.toggle("on", i <= n)); }

    function drawWave(live) {
      const ctx = waveC.getContext("2d");
      const W = waveC.width, H = waveC.height;
      ctx.clearRect(0, 0, W, H);
      ctx.lineWidth = 2 * devicePixelRatio;
      ctx.strokeStyle = "rgba(76,201,240,0.9)";
      ctx.beginPath();
      let drew = false;
      if (live && AE.isReady()) {
        const buf = new Uint8Array(AE.analyserSize());
        AE.waveform(buf);
        let energy = 0;
        for (const v of buf) energy += Math.abs(v - 128);
        if (energy > buf.length * 0.5) {
          for (let i = 0; i < buf.length; i++) {
            const x = (i / buf.length) * W;
            const y = H / 2 + ((buf[i] - 128) / 128) * H * 0.44;
            i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
          }
          drew = true;
        }
      }
      if (!drew && live) {
        // El audio no está disponible (o está silenciado): onda ilustrativa
        // construida con las notas que pesan en el perfil actual.
        const t = performance.now() / 1000;
        for (let px = 0; px < W; px += 2 * devicePixelRatio) {
          let y = 0;
          for (let pc = 0; pc < 12; pc += 2) {
            y += (chroma[pc] || 0.15) * Math.sin((px / W) * (14 + pc * 3) + t * (2 + pc * 0.4));
          }
          const yy = H / 2 + y * H * 0.09;
          px ? ctx.lineTo(px, yy) : ctx.moveTo(px, yy);
        }
        drew = true;
      }
      if (!drew) { ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); }
      ctx.stroke();
    }

    function drawChroma() {
      const ctx = chromaC.getContext("2d");
      const W = chromaC.width, H = chromaC.height;
      ctx.clearRect(0, 0, W, H);
      const max = Math.max(0.0001, ...chroma);
      const bw = W / 12;
      for (let pc = 0; pc < 12; pc++) {
        const h = (chroma[pc] / max) * (H - 40 * devicePixelRatio);
        ctx.fillStyle = T.pitchColor(pc, 0.85);
        ctx.beginPath();
        ctx.roundRect(pc * bw + bw * 0.14, H - 22 * devicePixelRatio - h, bw * 0.72, h, 5 * devicePixelRatio);
        ctx.fill();
        ctx.fillStyle = "rgba(232,234,242,0.75)";
        ctx.font = `${11 * devicePixelRatio}px Inter, sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText(T.NOTE_ES[T.PITCH_CLASSES[pc]], pc * bw + bw / 2, H - 7 * devicePixelRatio);
      }
    }

    function drawRank(ranked, reveal) {
      const ctx = rankC.getContext("2d");
      const W = rankC.width, H = rankC.height;
      ctx.clearRect(0, 0, W, H);
      if (!ranked) {
        ctx.fillStyle = "rgba(109,114,132,0.8)";
        ctx.font = `${12.5 * devicePixelRatio}px Inter, sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText("Las 24 candidatas aparecerán aquí tras la escucha", W / 2, H / 2);
        return;
      }
      const shown = ranked.slice(0, 8);
      const topPad = 26 * devicePixelRatio;
      const rowH = (H - topPad) / (shown.length + 0.3);
      const lo = Math.min(...shown.map(r => r.score));
      const hi = Math.max(...shown.map(r => r.score));
      shown.forEach((r, i) => {
        const y = topPad + i * rowH + rowH * 0.24;
        const frac = hi === lo ? 1 : (r.score - lo) / (hi - lo);
        const w = (0.12 + 0.82 * frac) * (W - 190 * devicePixelRatio) * reveal;
        const isBest = i === 0;
        ctx.fillStyle = isBest ? "rgba(255,184,107,0.95)" : T.pitchColor(r.key, 0.5);
        ctx.beginPath();
        ctx.roundRect(120 * devicePixelRatio, y, Math.max(4, w), rowH * 0.52, 4 * devicePixelRatio);
        ctx.fill();
        ctx.fillStyle = isBest ? "#ffd9a8" : "rgba(232,234,242,0.8)";
        ctx.font = `${isBest ? 700 : 500} ${11.5 * devicePixelRatio}px Inter, sans-serif`;
        ctx.textAlign = "left";
        ctx.fillText(T.keySpanishShort(r.key, r.mode), 6 * devicePixelRatio, y + rowH * 0.42);
        ctx.fillText(r.score.toFixed(3), 126 * devicePixelRatio + Math.max(4, w), y + rowH * 0.42);
      });
    }

    function reset() {
      chroma = new Array(12).fill(0);
      lastRanked = null;
      confPanel.classList.remove("show");
      setStep(-1);
      [waveC, chromaC, rankC].forEach(fitCanvas);
      lastW = waveC.getBoundingClientRect().width;
      drawWave(false); drawChroma(); drawRank(null, 0);
      if (rankAnim) cancelAnimationFrame(rankAnim);
    }

    function buildEvents(s) {
      if (s.noise) return { events: [], noise: true, duration: 4 };
      let events;
      if (s.ambiguous) {
        // Am – F – G – Am – C – F – G – C : reparte el protagonismo entre primas
        const chords = [[9, 0], [5, 1], [7, 1], [9, 0], [0, 1], [5, 1], [7, 1], [0, 1]];
        events = chords.map(([pc, md], i) => {
          const tr = T.triadOnDegree(pc, md, 0, 3);
          return { midis: [tr[0] - 12, ...tr], at: i * 0.6, dur: 0.95, vel: 0.8, triad: tr };
        });
      } else {
        events = AP.progressionEvents(s.pc, s.mode, s.degrees, { beat: 0.6 });
        // melodía por encima para enriquecer el perfil
        const steps2 = s.mode === 1 ? T.MAJOR_STEPS : T.MINOR_STEPS;
        const mel = [0, 2, 4, 2, 5, 4, 2, 0];
        mel.forEach((d, i) => {
          events.push({ midis: [72 + ((s.pc + steps2[d % 7]) % 12) + (d >= 7 ? 12 : 0)], at: i * 0.6 + 0.15, dur: 0.5, vel: 0.5 });
        });
      }
      return { events, duration: Math.max(...events.map(e => e.at + (e.dur || 0.8))) };
    }

    async function run() {
      reset();
      runBtn.disabled = true; stopBtn.disabled = false;
      setStep(0);
      const { events, noise, duration } = buildEvents(sample);
      const segCount = 3;
      const segChroma = [new Array(12).fill(0), new Array(12).fill(0), new Array(12).fill(0)];
      const t0 = performance.now();
      let stopped = false;

      if (!noise) {
        cancel = AE.playSequence(events, {});
        // acumulación del perfil a partir de las notas programadas
        for (const e of events) {
          for (const m of e.midis) {
            const w = (e.dur || 0.8) * (e.vel || 0.8) * Math.pow(0.85, Math.floor(m / 12) - 4);
            const seg = Math.min(segCount - 1, Math.floor((e.at / duration) * segCount));
            segChroma[seg][m % 12] += w;
          }
        }
      }

      // animación durante la "escucha"
      await new Promise(res => {
        function frame() {
          const t = (performance.now() - t0) / 1000;
          drawWave(!noise);
          if (noise) {
            // lluvia: energía repartida al azar, sin estructura tonal
            for (let pc = 0; pc < 12; pc++) chroma[pc] += Math.random() * 0.05;
            const ctx = waveC.getContext("2d");
            const W = waveC.width, H = waveC.height;
            ctx.clearRect(0, 0, W, H);
            ctx.strokeStyle = "rgba(76,201,240,0.7)";
            ctx.lineWidth = 1.5 * devicePixelRatio;
            ctx.beginPath();
            for (let x = 0; x < W; x += 3) {
              const y = H / 2 + (Math.random() - 0.5) * H * 0.5;
              x ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
            }
            ctx.stroke();
          } else {
            const progress = Math.min(1, t / duration);
            const target = new Array(12).fill(0);
            const upTo = Math.ceil(progress * segCount * 4) / (segCount * 4);
            for (let s = 0; s < segCount; s++) {
              const segFrac = T.clamp(upTo * segCount - s, 0, 1);
              for (let pc = 0; pc < 12; pc++) target[pc] += segChroma[s][pc] * segFrac;
            }
            for (let pc = 0; pc < 12; pc++) chroma[pc] += (target[pc] - chroma[pc]) * 0.12;
          }
          if (t > duration * 0.3) setStep(1);
          drawChroma();
          if (t < duration + 0.2 && !stopped) raf = requestAnimationFrame(frame);
          else res();
        }
        stopBtn.onclick = () => { stopped = true; AE.stopAll(); res(); };
        frame();
      });

      stopBtn.disabled = true;
      if (stopped) { runBtn.disabled = false; return; }

      // ranking de candidatas
      setStep(2);
      const finalChroma = noise
        ? chroma.map(v => v + Math.random() * 0.01)
        : segChroma.reduce((acc, s) => acc.map((v, i) => v + s[i]), new Array(12).fill(0));
      chroma = finalChroma.slice();
      drawChroma();
      const ranked = T.rankKeys(finalChroma);
      lastRanked = ranked;
      const tR = performance.now();
      await new Promise(res => {
        function animRank() {
          const p = T.clamp((performance.now() - tR) / 900, 0, 1);
          drawRank(ranked, 1 - Math.pow(1 - p, 3));
          if (p < 1) rankAnim = requestAnimationFrame(animRank);
          else res();
        }
        animRank();
      });

      // confianza
      setStep(3);
      const best = ranked[0], runnerUp = ranked[1];
      const agreement = noise ? 0.34 : segChroma.filter(sc => {
        const r = T.rankKeys(sc)[0];
        return r.key === best.key && r.mode === best.mode;
      }).length / segCount;
      const concentration = T.chromaConcentration(finalChroma);
      const conf = T.calculateConfidence(best, runnerUp, concentration, agreement);

      confPanel.classList.add("show");
      const meters = { correlation: conf.correlation, separation: conf.separation, concentration: conf.concentration, agreement };
      for (const [k, v] of Object.entries(meters)) {
        const m = $(`.meter[data-m="${k}"]`);
        m.querySelector(".val").textContent = `${Math.round(v * 100)} %`;
        requestAnimationFrame(() => { m.querySelector(".fill").style.width = `${v * 100}%`; });
      }
      const total = Math.round(conf.total * 100);
      const verdict = $("#lab-verdict");
      const keyName = T.keySpanishShort(best.key, best.mode);
      const keyOf = T.keyLabel(best.key, best.mode);
      if (noise || best.score < 0.25) {
        verdict.className = "verdict warn";
        verdict.innerHTML = `<strong>Señal tonal insuficiente.</strong> La huella no se parece lo bastante a ninguna
          de las 24 fichas (mejor correlación: ${best.score.toFixed(2)}). La herramienta real respondería
          «el audio no contiene suficiente información tonal» — y no inventaría nada.`;
      } else if (conf.total >= T.RELIABLE_THRESHOLD) {
        verdict.className = "verdict ok";
        verdict.innerHTML = `<strong>Veredicto: ${keyName} (${keyOf} · ${T.keyToCamelot(keyOf)}) — confianza ${total} %.</strong>
          Supera el umbral del 62 %: resultado fiable, entra en las listas.`;
      } else {
        verdict.className = "verdict warn";
        verdict.innerHTML = `<strong>Veredicto: ${keyName} (${keyOf}) — confianza ${total} %, por debajo del umbral del 62 %.</strong>
          La segunda candidata (${T.keySpanishShort(runnerUp.key, runnerUp.mode)}, a solo ${(best.score - runnerUp.score).toFixed(3)} puntos)
          está demasiado cerca: el resultado se muestra, pero queda en revisión. La duda, dicha en voz alta.`;
      }
      runBtn.disabled = false;
    }

    runBtn.addEventListener("click", run);
    window.addEventListener("resize", () => {
      const w = waveC.getBoundingClientRect().width;
      if (Math.abs(w - lastW) < 2) return; // p. ej., solo apareció la barra de scroll
      lastW = w;
      [waveC, chromaC, rankC].forEach(fitCanvas);
      drawWave(false);
      drawChroma();
      drawRank(lastRanked, 1);
    });
    reset();
  }

  /* ════════════════════════════════════════════════════════
     EXP 9 — Anatomía del resultado
     ════════════════════════════════════════════════════════ */

  function initAnatomy() {
    const card = $("#anatomy-card");
    if (!card) return;
    const detail = $("#anatomy-detail");
    const fields = [
      { k: "Tonalidad", v: "Fa sostenido Mayor", d: "La «casa» de la canción y su estado de ánimo, en la nomenclatura tradicional española. Es el mismo dato que verás repetido en dos idiomas más — porque un dato que solo entienden los expertos es un dato a medias." },
      { k: "Notación", v: "F#", d: "El formato internacional que usan las apps y webs de música: C=Do, D=Re… y la «m» final significa menor. Sin «m», es Mayor. Útil para comparar con cualquier otra herramienta del mundo." },
      { k: "Camelot", v: "2B", d: "La dirección de la canción en la rueda que exploraste en el Acto II. Combina bien con 2A, 1B y 3B. Es el idioma de la mezcla armónica: números vecinos, transiciones suaves." },
      { k: "BPM", v: "130", d: "El pulso: golpes de ritmo por minuto. Como el latido del corazón — 70 en una balada que pasea, 130 en una canción que corre. Junto a la tonalidad, el segundo criterio para encadenar canciones sin sobresaltos." },
      { k: "Fuente", v: "ReccoBeats", d: "De dónde salió el dato. Aquí: la base de datos musical ReccoBeats, tras identificar la grabación exacta en el catálogo de Spotify. Cada respuesta lleva su recibo — nada es una caja negra." },
      { k: "Caché", v: "No (primera consulta)", d: "Si la respuesta ya estaba en la memoria compartida. La próxima persona que consulte esta canción la recibirá al instante — el trabajo hecho no se repite. Con fecha de caducidad y número de versión, para que las mejoras del método recalculen lo viejo." },
      { k: "Confianza de identificación", v: "Alta", d: "Cuánta seguridad hay de haber encontrado la grabación correcta — no una versión en directo, no un cover. Es la confianza del «DNI comprobado»." },
      { k: "Confianza tonal", v: "— sin dato", d: "Cuánta seguridad hay en la tonalidad misma. ReccoBeats no proporciona este número… y por eso aquí pone «sin dato» en lugar de un porcentaje inventado. Esta rayita es quizá el píxel más honesto de toda la interfaz." },
    ];
    fields.forEach((f, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "hotspot";
      b.innerHTML = `<span class="k">${f.k}</span><span class="v">${f.v}</span>`;
      b.addEventListener("click", () => {
        $$(".hotspot").forEach(x => x.classList.remove("sel"));
        b.classList.add("sel");
        detail.innerHTML = `<h4>${f.k}: ${f.v}</h4><p>${f.d}</p>`;
      });
      card.appendChild(b);
    });
  }

  /* ════════════════════════════════════════════════════════
     EXP 10 — Primas hermanas (relativos)
     ════════════════════════════════════════════════════════ */

  function initRelatives() {
    const majBars = $("#bars-cmajor"), minBars = $("#bars-aminor");
    if (!majBars) return;
    // perfiles didácticos de las dos progresiones
    function profileOf(chords) {
      const p = new Array(12).fill(0);
      chords.forEach(([pc, md], i) => {
        const tr = T.triadOnDegree(pc, md, 0, 3);
        tr.forEach(m => { p[m % 12] += 1; });
        p[pc] += i === 0 || i === chords.length - 1 ? 1.2 : 0.3; // el hogar pesa más al abrir y cerrar
      });
      return p;
    }
    const progs = {
      major: [[0, 1], [5, 1], [7, 1], [0, 1]],
      minor: [[9, 0], [5, 1], [7, 1], [9, 0]],
    };
    function paint(el, prof) {
      el.innerHTML = "";
      const max = Math.max(...prof);
      prof.forEach((v, pc) => {
        const b = document.createElement("div");
        b.className = "b";
        b.style.background = T.pitchColor(pc, 0.8);
        b.style.height = "2px";
        el.appendChild(b);
        requestAnimationFrame(() => requestAnimationFrame(() => { b.style.height = `${(v / max) * 100}%`; }));
      });
    }
    paint(majBars, profileOf(progs.major));
    paint(minBars, profileOf(progs.minor));
    $$("[data-relative]").forEach(btn => {
      btn.addEventListener("click", () => {
        const chords = progs[btn.dataset.relative];
        const events = chords.map(([pc, md], i) => {
          const tr = T.triadOnDegree(pc, md, 0, 3);
          return { midis: [tr[0] - 12, ...tr], at: i * 0.7, dur: i === chords.length - 1 ? 1.8 : 1.05, vel: 0.82 };
        });
        AE.playSequence(events);
      });
    });
  }

  /* ════════════════════════════════════════════════════════
     EXP 11 — Modulación (línea de tiempo)
     ════════════════════════════════════════════════════════ */

  function initModulation() {
    const track = $("#mod-track");
    if (!track) return;
    const caption = $("#mod-caption");
    const globalBox = $("#mod-global");

    /* Cada tramo cuenta algo propio: si el texto no cambiara al pulsar,
       el experimento no enseñaría nada. */
    const segs = [
      {
        name: "Intro", key: "A#", pc: 10, mode: 1, w: 15,
        say: "Arranca solo con voces, sin un instrumento. Aun así, desde el primer segundo la canción ya está en una tonalidad concreta: esta es la casa donde nace.",
      },
      {
        name: "Balada", key: "A#", pc: 10, mode: 1, w: 30,
        say: "Entra el piano y la canción se acomoda. Fíjate en que <b>no se ha movido</b>: sigue en la misma tonalidad que la intro. Y es el tramo más largo de todos — recuerda este detalle, porque decidirá el final del experimento.",
      },
      {
        name: "Ópera", key: "A", pc: 9, mode: 1, w: 20,
        say: "Primera mudanza. La canción baja un peldaño y se instala en otra tonalidad. Aquí se amontonan coros, voces sueltas y cambios rapidísimos: es el tramo más difícil de reducir a un solo nombre.",
      },
      {
        name: "Rock", key: "D#", pc: 3, mode: 1, w: 20,
        say: "Entran las guitarras y la canción se muda otra vez, ahora a un barrio bastante lejos del de partida. Nada de esto es un error de nadie: es la canción cambiando de tema y de humor.",
      },
      {
        name: "Final", key: "Cm", pc: 0, mode: 0, w: 15,
        say: "Todo se apaga y la canción cierra en <b>modo menor</b>, más recogido — el único tramo que no es Mayor. Es el color con el que te quedas cuando termina.",
      },
    ];

    const distintas = new Set(segs.map(s => s.key)).size;
    const mudanzas = segs.filter((s, i) => i > 0 && segs[i - 1].key !== s.key).length;

    const IDLE = `<p class="mod-idle">👆 Toca el primer bloque, <b>Intro</b>, para empezar a recorrer la canción.</p>`;
    caption.innerHTML = IDLE;

    /* El «para qué» del experimento, siempre visible: la comparación es el mensaje. */
    globalBox.innerHTML = `
      <p class="mod-g-line">Esta canción se muda <b>${mudanzas} veces</b> y pasa por <b>${distintas} tonalidades distintas</b>…</p>
      <p class="mod-g-line">…y el Tonalizador la etiqueta con <b>un solo dato</b>:
        <span class="mod-g-key">Do menor · 5A · 143 BPM</span></p>
      <p class="mod-g-why">¿Se está equivocando? No. Está <b>resumiendo</b>. La etiqueta recoge la tonalidad
        <b>predominante</b>: la que más manda a lo largo de toda la canción (por eso importaba que la balada fuera
        el tramo más largo). Es como decir que una película «es una comedia» aunque tenga una escena triste:
        no es falso, es lo que necesitas para saber en qué estante ponerla.</p>
      <p class="mod-g-why">Y ese es justo el trabajo del Tonalizador: <b>ordenar tu playlist</b>, no hacer el
        análisis musicológico de cada minuto. Para ordenar hace falta un dato por canción.</p>`;

    segs.forEach((s, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "mod-seg";
      b.style.width = `${s.w}%`;
      b.style.background = T.pitchColor(s.pc, 0.75);
      b.innerHTML = `<span class="ms-name">${s.name}</span><span class="ms-key">${T.keySpanishShort(s.pc, s.mode)}</span>`;
      /* Marca la costura donde la canción cambia de tonalidad: la mudanza
         se ve en la línea de tiempo antes de pulsar nada. */
      if (i > 0 && segs[i - 1].key !== s.key) b.classList.add("moved");
      b.setAttribute("aria-label",
        `Tramo ${i + 1} de ${segs.length}: ${s.name}, en ${T.keyToSpanish(s.key)}`
        + (i > 0 ? (segs[i - 1].key !== s.key ? ". Cambia de tonalidad" : ". Misma tonalidad que el anterior") : ""));
      b.addEventListener("click", () => {
        AE.playSequence(AP.progressionEvents(s.pc, s.mode, [0, 4, 0], { beat: 0.55 }));
        track.querySelectorAll(".mod-seg").forEach(x => x.classList.remove("on"));
        b.classList.add("on");

        const cambia = i > 0 && segs[i - 1].key !== s.key;
        const move = i === 0
          ? `<span class="mod-move start">▶ Punto de partida</span>`
          : cambia
            ? `<span class="mod-move go">🚚 Se muda — cambia de tonalidad respecto al tramo anterior</span>`
            : `<span class="mod-move stay">🏠 Se queda — misma tonalidad que el tramo anterior</span>`;

        caption.innerHTML = `
          <p class="mod-now-head">
            <span class="mod-now-n">Tramo ${i + 1} de ${segs.length}</span>
            <strong>${s.name}</strong>
          </p>
          <p class="mod-now-key">Este tramo suena en
            <b style="color:${T.pitchColor(s.pc, 1)}">${T.keyToSpanish(s.key)}</b>
            <span class="mod-now-cam">${T.keyToCamelot(s.key)}</span>
          </p>
          <p class="mod-now-move">${move}</p>
          <p class="mod-now-say">${s.say}</p>`;
      });
      track.appendChild(b);
    });
  }

  /* ════════════════════════════════════════════════════════
     EXP 6 — Cabina de DJ (sesión encadenada sobre la rueda)
     El disco marca la salida; cada fila se destapa al decidir
     la anterior, construida sobre TU elección real: siempre hay
     exactamente 2 opciones compatibles y 2 trampas por fila.
     ════════════════════════════════════════════════════════ */

  function initGame() {
    const rowsWrap = $("#dj-rows");
    if (!rowsWrap) return;

    const camelotToKey = {};
    for (const [k, v] of Object.entries(T.CAMELOT_BY_KEY)) camelotToKey[v] = k;
    const ALL_CODES = Object.keys(camelotToKey);
    const ROWS = 5, COLS = 4;

    /* Las 10 «combinaciones» pregeneradas: disco de partida + semilla.
       Misma semilla y mismas decisiones → exactamente el mismo tablero. */
    const COMBOS = [
      { disc: "8A", seed: 101 }, { disc: "5B", seed: 202 }, { disc: "12A", seed: 303 },
      { disc: "3B", seed: 404 }, { disc: "10A", seed: 505 }, { disc: "7B", seed: 606 },
      { disc: "1A", seed: 707 }, { disc: "9B", seed: 808 }, { disc: "4A", seed: 909 },
      { disc: "11B", seed: 1010 },
    ];

    /* Generador aleatorio con semilla (mulberry32): reproducible. */
    function rng(seed) {
      let a = seed >>> 0;
      return () => {
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }
    function hashStr(s) {
      let h = 2166136261;
      for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
      return h >>> 0;
    }

    const disc = $("#game-disc");
    const chainBtn = $("#dj-play-chain");
    const againBtn = $("#dj-again");
    const feedback = $("#game-feedback");

    let comboIdx = 0;
    let selections = new Array(ROWS).fill(null); // código elegido en cada fila
    let busy = false;                            // volteo o reproducción en curso
    let evaluated = false;

    function pcModeOf(code) {
      const keyOf = camelotToKey[code];
      return { pc: T.PITCH_CLASSES.indexOf(keyOf.replace("m", "")), mode: keyOf.endsWith("m") ? 0 : 1, keyOf };
    }
    const isCompatible = (a, b) => T.camelotNeighbors(a).includes(b);
    const prevKeyOf = rowIdx => (rowIdx === 0 ? COMBOS[comboIdx].disc : selections[rowIdx - 1]);

    function playKey(code) {
      const { pc, mode } = pcModeOf(code);
      AE.playSequence(AP.progressionEvents(pc, mode, [0], { beat: 0.55 }));
    }

    /* Opciones de una fila: 2 vecinas de la elección anterior + 2 lejanas,
       en columnas barajadas. Determinista por (combinación, fila, tonalidad previa). */
    function buildRowOptions(rowIdx, prevCode) {
      const rand = rng((Math.imul(COMBOS[comboIdx].seed, 2654435761) ^ Math.imul(rowIdx + 1, 40503) ^ hashStr(prevCode)) >>> 0);
      const shuffle = arr => {
        for (let i = arr.length - 1; i > 0; i--) {
          const j = Math.floor(rand() * (i + 1));
          [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
      };
      const good = shuffle(T.camelotNeighbors(prevCode).slice()).slice(0, 2);
      const banned = new Set([prevCode, ...T.camelotNeighbors(prevCode)]);
      const bad = [];
      while (bad.length < 2) {
        const c = ALL_CODES[Math.floor(rand() * ALL_CODES.length)];
        if (!banned.has(c) && !bad.includes(c)) bad.push(c);
      }
      return shuffle([...good, ...bad]);
    }

    /* ---------- Construcción del tablero (5 filas × 4 casillas) ---------- */

    const cardEls = [];
    for (let r = 0; r < ROWS; r++) {
      const row = document.createElement("div");
      row.className = "dj-row";
      const tag = document.createElement("span");
      tag.className = "dj-row-tag";
      tag.textContent = String(r + 1);
      tag.setAttribute("aria-hidden", "true");
      const opts = document.createElement("div");
      opts.className = "dj-row-opts";
      row.appendChild(tag);
      row.appendChild(opts);
      rowsWrap.appendChild(row);
      cardEls.push([]);
      for (let cix = 0; cix < COLS; cix++) {
        const card = document.createElement("div");
        card.className = "dj-opt facedown";
        card.innerHTML = `
          <button class="dj-cell" type="button" disabled>
            <span class="code"></span><span class="nm"></span>
          </button>
          <label class="dj-check">
            <input type="checkbox" disabled>
            <span class="dj-box" aria-hidden="true"></span>
          </label>`;
        const cell = card.querySelector(".dj-cell");
        const input = card.querySelector("input");
        cell.addEventListener("click", () => {
          if (busy || card.classList.contains("facedown")) return;
          playKey(card.dataset.code);
        });
        input.addEventListener("change", () => onCheck(r, cix, input.checked));
        opts.appendChild(card);
        cardEls[r].push(card);
      }
    }

    function setCard(card, code) {
      card.dataset.code = code;
      const { pc, keyOf } = pcModeOf(code);
      const nombre = T.keyToSpanish(keyOf);
      const codeEl = card.querySelector(".code");
      codeEl.textContent = code;
      codeEl.style.color = T.pitchColor(pc);
      card.querySelector(".nm").textContent = nombre;
      card.querySelector(".dj-cell").setAttribute("aria-label", `Escuchar ${nombre} (${code})`);
      card.querySelector("input").setAttribute("aria-label", `Elegir ${nombre} (${code})`);
    }

    /* Volteo tipo panel de aeropuerto: la casilla recorre códigos al azar antes de asentarse. */
    function flapCard(card, finalCode, done) {
      card.classList.remove("facedown");
      card.classList.add("flipping");
      const codeEl = card.querySelector(".code"), nmEl = card.querySelector(".nm");
      let ticks = 7 + Math.floor(Math.random() * 4);
      const iv = setInterval(() => {
        const c = ALL_CODES[Math.floor(Math.random() * ALL_CODES.length)];
        const info = pcModeOf(c);
        codeEl.textContent = c;
        codeEl.style.color = T.pitchColor(info.pc);
        nmEl.textContent = T.keyToSpanish(info.keyOf);
        if (--ticks <= 0) {
          clearInterval(iv);
          card.classList.remove("flipping");
          setCard(card, finalCode);
          if (done) done();
        }
      }, 70);
    }

    function hideRow(r) {
      selections[r] = null;
      cardEls[r].forEach(card => {
        card.classList.remove("right", "wrong", "playing", "selected", "flipping");
        card.querySelector("input").checked = false;
        card.classList.add("facedown");
      });
    }

    function revealRow(r, { animate = true } = {}) {
      const codes = buildRowOptions(r, prevKeyOf(r));
      if (!animate) {
        cardEls[r].forEach((card, i) => { card.classList.remove("facedown"); setCard(card, codes[i]); });
        syncControls();
        return;
      }
      busy = true;
      syncControls();
      let pending = COLS;
      cardEls[r].forEach((card, i) => {
        setTimeout(() => flapCard(card, codes[i], () => {
          if (--pending === 0) { busy = false; syncControls(); }
        }), i * 90);
      });
    }

    function clearEvaluation() {
      if (!evaluated) return;
      evaluated = false;
      cardEls.forEach(cards => cards.forEach(card => card.classList.remove("right", "wrong", "playing")));
      disc.classList.remove("playing");
    }

    function syncControls() {
      chainBtn.disabled = busy || !selections.every(Boolean);
      againBtn.disabled = busy;
      disc.disabled = busy;
      cardEls.forEach(cards => cards.forEach(card => {
        const off = busy || card.classList.contains("facedown");
        card.querySelector("input").disabled = off;
        card.querySelector(".dj-cell").disabled = off;
      }));
    }

    function onCheck(r, cix, checked) {
      if (busy) return;
      clearEvaluation();
      const card = cardEls[r][cix];
      if (checked) {
        cardEls[r].forEach(c => {
          if (c !== card) { c.querySelector("input").checked = false; c.classList.remove("selected"); }
        });
        card.classList.add("selected");
        selections[r] = card.dataset.code;
        for (let k = r + 1; k < ROWS; k++) hideRow(k);
        playKey(card.dataset.code);
        if (r + 1 < ROWS) revealRow(r + 1);
        feedback.innerHTML = selections.every(Boolean)
          ? "Cadena completa. Pulsa <strong>«Escuchar transiciones»</strong> para descubrir qué saltos respetan la rueda."
          : `Fila ${r + 1}: eliges <strong>${card.dataset.code}</strong>. Se destapa la fila ${r + 2}, construida sobre tu elección.`;
      } else {
        card.classList.remove("selected");
        selections[r] = null;
        for (let k = r + 1; k < ROWS; k++) hideRow(k);
        feedback.textContent = `Fila ${r + 1} sin elección: las filas siguientes vuelven a taparse.`;
      }
      syncControls();
    }

    /* ---------- Escuchar la cadena entera y evaluar en cascada ---------- */

    function playChain() {
      if (busy || !selections.every(Boolean)) return;
      clearEvaluation();
      evaluated = true;
      busy = true;
      syncControls();
      const chain = [COMBOS[comboIdx].disc, ...selections];
      const STEP = 1.05;
      AE.playSequence(chain.map((code, i) => {
        const { pc, mode } = pcModeOf(code);
        const ev = AP.progressionEvents(pc, mode, [0], { beat: 0.55 })[0];
        return { ...ev, at: i * STEP, dur: 1.4 };
      }));
      const selCards = selections.map((code, r) => cardEls[r].find(c => c.dataset.code === code));
      let hits = 0;
      chain.forEach((code, i) => {
        setTimeout(() => {
          if (i === 0) {
            disc.classList.add("playing");
            setTimeout(() => disc.classList.remove("playing"), STEP * 900);
            return;
          }
          const ok = isCompatible(chain[i - 1], chain[i]);
          if (ok) hits++;
          const card = selCards[i - 1];
          if (!card) return;
          card.classList.add(ok ? "right" : "wrong", "playing");
          setTimeout(() => card.classList.remove("playing"), STEP * 900);
        }, i * STEP * 1000);
      });
      setTimeout(() => {
        busy = false;
        feedback.innerHTML = resultMessage(hits);
        syncControls();
      }, ((chain.length - 1) * STEP + 1.35) * 1000);
    }

    function resultMessage(hits) {
      const base = `<strong>${hits} de 5</strong> transiciones respetan la rueda. `;
      if (hits === 5) return "🏆 " + base + "Sesión redonda: oído de cabina profesional. ¿Otra combinación?";
      if (hits >= 3) return "🎛️ " + base + "Fíjate en los recuadros rojos: cambia esas casillas y vuelve a escuchar.";
      if (hits >= 1) return "🌀 " + base + "Recuerda la regla: mismo número con la otra letra, o número de al lado con la misma letra.";
      return "😅 " + base + "Todas las trampas a la primera — ¡mérito tiene! La rueda de arriba te chiva las vecinas de cada casilla.";
    }

    /* ---------- Disco y combinaciones ---------- */

    function setDisc(code) {
      const { pc, keyOf } = pcModeOf(code);
      disc.textContent = code;
      disc.style.background = T.pitchColor(pc, 0.9);
      disc.title = `Escuchar ${T.keyToSpanish(keyOf)} (${code})`;
      $("#game-now-name").textContent = `Sonando: ${T.keyToSpanish(keyOf)}`;
    }

    function flapDisc(finalCode, done) {
      disc.classList.add("flipping");
      let ticks = 9;
      const iv = setInterval(() => {
        const c = ALL_CODES[Math.floor(Math.random() * ALL_CODES.length)];
        disc.textContent = c;
        disc.style.background = T.pitchColor(pcModeOf(c).pc, 0.9);
        if (--ticks <= 0) {
          clearInterval(iv);
          disc.classList.remove("flipping");
          setDisc(finalCode);
          if (done) done();
        }
      }, 70);
    }

    function newBoard({ animate }) {
      AE.stopAll();
      evaluated = false;
      $("#game-score").textContent = `Combinación ${comboIdx + 1} de ${COMBOS.length}`;
      for (let r = 0; r < ROWS; r++) hideRow(r);
      feedback.innerHTML = "Escucha el disco y las cuatro opciones de la fila 1; marca una casilla para destapar la fila 2.";
      if (animate) {
        busy = true;
        syncControls();
        flapDisc(COMBOS[comboIdx].disc, () => {
          busy = false;
          revealRow(0, { animate: true });
        });
      } else {
        setDisc(COMBOS[comboIdx].disc);
        revealRow(0, { animate: false });
      }
    }

    disc.addEventListener("click", () => { if (!busy) playKey(COMBOS[comboIdx].disc); });
    chainBtn.addEventListener("click", playChain);
    againBtn.addEventListener("click", () => {
      if (busy) return;
      comboIdx = (comboIdx + 1) % COMBOS.length;
      newBoard({ animate: true });
    });

    newBoard({ animate: false });
  }

  /* ════════════════════════════════════════════════════════
     EXP 13 — Tarjetas + Quiz final
     ════════════════════════════════════════════════════════ */

  function initFlips() {
    $$(".flip").forEach(f => {
      const toggle = () => {
        const on = f.classList.toggle("flipped");
        f.setAttribute("aria-pressed", String(on));
      };
      f.addEventListener("click", toggle);
      f.addEventListener("keydown", e => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); }
      });
    });
  }

  function initQuiz() {
    const body = $("#quiz-body");
    if (!body) return;
    const QUESTIONS = [
      {
        q: "Una canción de tu playlist aparece «sin clasificar». ¿Qué ha pasado?",
        opts: [
          "La herramienta ha fallado y hay que reiniciarla",
          "Ninguna fuente dio un dato fiable, y prefirió el hueco al error",
          "La canción no tiene tonalidad",
        ],
        right: 1,
        expl: "Es el primer principio de diseño: mejor decir «no lo sé» que equivocarse en silencio. Tienes el análisis acústico y la corrección manual como salidas.",
      },
      {
        q: "El resultado dice «Confianza de identificación: Alta · Confianza tonal: sin dato». ¿Qué significa?",
        opts: [
          "Que el resultado es poco fiable y hay que descartarlo",
          "Que se encontró la grabación correcta, y la fuente no publica un porcentaje de seguridad sobre el tono — y no se inventa",
          "Que hay que volver a analizar la canción",
        ],
        right: 1,
        expl: "Son dos preguntas distintas: ¿qué canción es? y ¿en qué tono está? La primera se respondió con seguridad alta; para la segunda, ReccoBeats no da un número — y la herramienta jamás rellena huecos con porcentajes inventados.",
      },
      {
        q: "Estás pinchando una canción en 5A. ¿Cuál de estas encajaría con más suavidad?",
        opts: ["5B", "11A", "2B"],
        right: 0,
        expl: "Regla de la rueda: mismo número con la otra letra (5B), o número vecino con la misma letra (4A, 6A). 11A y 2B están al otro lado del reloj.",
      },
      {
        q: "Le das un MP3 al análisis acústico local. ¿Adónde viaja tu archivo?",
        opts: [
          "A los servidores de Tonalizador, cifrado",
          "A ReccoBeats, para su análisis",
          "A ninguna parte: se analiza dentro de tu navegador y se descarta",
        ],
        right: 2,
        expl: "El audio jamás se sube. Se decodifica, se pesa nota a nota y se descarta, todo dentro de tu dispositivo. Es el principio «tu música no viaja».",
      },
      {
        q: "Tu playlist dice «Hotel California — Eagles» y el catálogo ofrece la versión «Live on MTV 1994». ¿Qué hace Tonalizador?",
        opts: [
          "La acepta: es la misma canción",
          "La manda a revisión: un directo puede estar en otro tono",
          "Elige automáticamente la más popular",
        ],
        right: 1,
        expl: "Directos, remixes, acústicos y covers nunca pasan solos. Este caso es real: el directo de 1994 está en un tono distinto al del estudio de 1976.",
      },
      {
        q: "Bohemian Rhapsody atraviesa varias tonalidades y aun así el resultado es «Do menor». ¿Es un error?",
        opts: [
          "Sí: debería listar todas las secciones",
          "No: es la tonalidad predominante, un resumen útil para clasificar",
          "Sí: las canciones que modulan no pueden analizarse",
        ],
        right: 1,
        expl: "Para agrupar una playlist hace falta un solo dato por canción, y el dato elegido es el honesto: el predominante. La interfaz te muestra la fuente, y este tutorial te ha contado el matiz.",
      },
    ];
    let idx = 0, score = 0;
    /* Mismos sonidos que la Misión guiada: acierto = arpegio ascendente, fallo = pitido corto. */
    const soundOK = () => AE.playSequence([
      { midis: [72], at: 0, dur: 0.16, vel: 0.5 }, { midis: [76], at: 0.09, dur: 0.16, vel: 0.5 },
      { midis: [79], at: 0.18, dur: 0.2, vel: 0.55 }, { midis: [84], at: 0.28, dur: 0.55, vel: 0.6 },
    ]);
    const soundNo = () => AE.playBuzz();
    function render() {
      if (idx >= QUESTIONS.length) {
        const msg = score === 6 ? "Impecable. Ya no usas el Tonalizador: conversas con él."
          : score >= 4 ? "Excelente criterio. Las dudas que te queden, la propia herramienta te las irá confirmando."
          : "Buen viaje. Relee los actos que te bailen — cada experimento sigue ahí, esperándote.";
        body.innerHTML = `<p class="quiz-score">Resultado: ${score} de ${QUESTIONS.length}</p>
          <p style="color:var(--text-dim)">${msg}</p>
          <button class="btn" id="quiz-again" type="button">↻ Repetir el reto</button>`;
        $("#quiz-again").addEventListener("click", () => { idx = 0; score = 0; render(); });
        return;
      }
      const q = QUESTIONS[idx];
      body.innerHTML = `<p class="panel-hint" style="margin:0 0 8px">Pregunta ${idx + 1} de ${QUESTIONS.length}</p>
        <p class="quiz-q">${q.q}</p>
        <div class="quiz-opts">${q.opts.map((o, i) => `<button class="quiz-opt" data-i="${i}" type="button">${o}</button>`).join("")}</div>
        <p class="quiz-expl">${q.expl}</p>
        <button class="btn btn-primary" id="quiz-next" type="button" style="display:none">Siguiente →</button>`;
      $$(".quiz-opt").forEach(b => b.addEventListener("click", () => {
        const i = parseInt(b.dataset.i, 10);
        $$(".quiz-opt").forEach(x => x.disabled = true);
        if (i === q.right) { b.classList.add("right"); score++; soundOK(); }
        else { b.classList.add("wrong"); $$(".quiz-opt")[q.right].classList.add("right"); soundNo(); }
        $(".quiz-expl").classList.add("show");
        const next = $("#quiz-next");
        next.style.display = "inline-flex";
        next.textContent = idx === QUESTIONS.length - 1 ? "Ver mi resultado →" : "Siguiente →";
        next.addEventListener("click", () => { idx++; render(); });
      }));
    }
    render();
  }

  /* ════════════════════════════════════════════════════════
     EXP 12 — Ejemplos famosos: la sesión imposible
     ════════════════════════════════════════════════════════ */

  function initFamous() {
    const grid = $("#famous-grid");
    if (!grid) return;
    const desk = $("#famous-desk");

    // Resultados reales de la prueba pública del 29 de julio de 2026
    const SONGS = [
      { id: "bohemian", t: "Bohemian Rhapsody", a: "Queen", year: "1975", keyOf: "Cm", bpm: 143,
        note: "Modula varias veces: 5A es su tonalidad predominante, no la de cada sección." },
      { id: "billie", t: "Billie Jean", a: "Michael Jackson", year: "1982", keyOf: "Bm", bpm: 117, note: null },
      { id: "hotel", t: "Hotel California", a: "Eagles", year: "1976", keyOf: "D", bpm: 147,
        note: "El catálogo identificó una remasterización: la misma grabación con el sonido pulido." },
      { id: "rolling", t: "Rolling in the Deep", a: "Adele", year: "2010", keyOf: "G#", bpm: 105, note: null },
      { id: "teen", t: "Smells Like Teen Spirit", a: "Nirvana", year: "1991", keyOf: "C#", bpm: 117, note: null },
    ];

    const pcOf = s => T.PITCH_CLASSES.indexOf(s.keyOf.replace("m", ""));
    const modeOf = s => (s.keyOf.endsWith("m") ? 0 : 1);
    const camOf = s => T.keyToCamelot(s.keyOf);
    let selected = null;

    SONGS.forEach(s => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "famous-card";
      card.dataset.id = s.id;
      card.innerHTML = `
        <span class="fc-disc" style="background:${T.pitchColor(pcOf(s), 0.9)}">${camOf(s)}</span>
        <span class="fc-body">
          <span class="fc-t">${s.t}</span>
          <span class="fc-a">${s.a} · ${s.year}</span>
          <span class="fc-k">${T.keyToSpanish(s.keyOf)} · ${s.keyOf} · ${s.bpm} BPM</span>
        </span>`;
      card.addEventListener("click", () => select(s.id));
      grid.appendChild(card);
    });

    function cadence(s, when = 0) {
      const deg = modeOf(s) === 1 ? [0, 3, 4, 0] : [0, 5, 3, 0];
      return AP.progressionEvents(pcOf(s), modeOf(s), deg, { beat: 0.6 })
        .map(e => ({ ...e, at: e.at + when }));
    }

    function select(id, silent) {
      selected = SONGS.find(s => s.id === id);
      $$(".famous-card").forEach(c => c.classList.toggle("sel", c.dataset.id === id));
      if (!silent) AE.playSequence(cadence(selected));
      renderDesk();
    }

    function renderDesk() {
      const s = selected;
      const vecinas = T.camelotNeighbors(camOf(s));
      const otras = SONGS.filter(o => o.id !== s.id);
      const compatibles = otras.filter(o => vecinas.includes(camOf(o)));

      desk.innerHTML = `
        <div class="desk-now">
          <span class="now-disc" style="background:${T.pitchColor(pcOf(s), 0.9)}">${camOf(s)}</span>
          <div>
            <div style="font-weight:700">En el plato: ${s.t}</div>
            <div class="panel-hint" style="margin:2px 0 0">${T.keyToSpanish(s.keyOf)} · ${s.keyOf} · ${s.bpm} BPM ·
            combina con ${vecinas.join(", ")}</div>
          </div>
          <button class="btn" data-again="1" type="button">▶ Su tonalidad</button>
        </div>
        ${s.note ? `<p class="panel-hint" style="margin:10px 0 0">ℹ️ ${s.note}</p>` : ""}
        <div class="desk-list">
          ${otras.map(o => {
            const ok = vecinas.includes(camOf(o));
            return `<div class="desk-row ${ok ? "ok" : "far"}">
              <span class="chip ${ok ? "ok" : ""}">${camOf(o)}</span>
              <span class="dr-name">${o.t}</span>
              <span class="dr-verdict">${ok
                ? (camOf(o).slice(-1) !== camOf(s).slice(-1)
                    ? "✅ misma casilla, otra letra: son relativas"
                    : "✅ número vecino: casi la misma familia de notas")
                : "⚠️ lejos en la rueda: el salto se nota"}</span>
              <button class="btn" data-mix="${o.id}" type="button">▶ Escuchar el salto</button>
            </div>`;
          }).join("")}
        </div>
        <p class="panel-hint">${compatibles.length
          ? `De estas cinco, <strong>${compatibles.length}</strong> encaja${compatibles.length > 1 ? "n" : ""} con ${s.t}.`
          : `Ninguna de las otras cuatro encaja con ${s.t}: su casilla queda aislada en la rueda.`}</p>`;

      desk.querySelector("[data-again]").addEventListener("click", () => AE.playSequence(cadence(s)));
      desk.querySelectorAll("[data-mix]").forEach(b => b.addEventListener("click", () => {
        const o = SONGS.find(x => x.id === b.dataset.mix);
        AE.playSequence([
          ...AP.progressionEvents(pcOf(s), modeOf(s), [0, 4], { beat: 0.62 }),
          ...AP.progressionEvents(pcOf(o), modeOf(o), [0, 0], { beat: 0.62 }).map(e => ({ ...e, at: e.at + 1.35 })),
        ]);
      }));
    }

    select("billie", true); // al cargar la página no debe sonar nada
  }

  /* ════════════════════════════════════════════════════════
     EXP 13 — El truco de los cuatro acordes (I–V–vi–IV)
     ════════════════════════════════════════════════════════ */

  function initFourChords() {
    const keys = $("#four-keys");
    if (!keys) return;
    const wrap = $("#four-chords");
    const DEG = [0, 4, 5, 3];                       // I · V · vi · IV
    const ROMAN = ["I", "ii", "iii", "IV", "V", "vi", "vii°"];
    const CALIDAD = [1, 0, 0, 1, 1, 0, -1];         // 1 Mayor · 0 menor · -1 disminuido
    let tonic = 0;

    T.PITCH_CLASSES.forEach((name, pc) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = T.NOTE_ES[name];
      b.setAttribute("aria-pressed", String(pc === 0));
      b.addEventListener("click", () => { tonic = pc; render(); });
      keys.appendChild(b);
    });

    function render() {
      Array.from(keys.children).forEach((b, i) => b.setAttribute("aria-pressed", String(i === tonic)));
      const keyOf = T.keyLabel(tonic, 1);
      $("#four-label").textContent = `${T.keyToSpanish(keyOf)} · ${keyOf} · ${T.keyToCamelot(keyOf)}`;
      wrap.innerHTML = DEG.map((d, i) => {
        const rootPc = (tonic + T.MAJOR_STEPS[d]) % 12;
        const menor = CALIDAD[d] === 0;
        return `<div class="fchord" data-i="${i}" style="--c:${T.pitchColor(rootPc, 0.9)}">
            <span class="fch-rn">${ROMAN[d]}</span>
            <span class="fch-name">${T.NOTE_ES[T.PITCH_CLASSES[rootPc]]}${menor ? "m" : ""}</span>
            <span class="fch-mode">${menor ? "menor" : "Mayor"}</span>
          </div>`;
      }).join("");
    }

    $("#four-play").addEventListener("click", () => {
      const ev = AP.progressionEvents(tonic, 1, DEG, { beat: 0.78 });
      const cards = () => $$("#four-chords .fchord");
      cards().forEach(c => c.classList.remove("on"));
      AE.playSequence(ev, {
        onStep: (_e, i) => {
          cards().forEach((c, j) => c.classList.toggle("on", j === i % 4));
        },
        onEnd: () => cards().forEach(c => c.classList.remove("on")),
      });
    });

    render();
  }

  /* ════════════════════════════════════════════════════════
     MISIÓN GUIADA — la app real, escena a escena
     ════════════════════════════════════════════════════════ */

  function initTour() {
    const root = $("#tour-root");
    if (!root) return;
    $("#tour-gallery")?.classList.add("tour-hidden");

    const TOUR = [
      {
        img: "img/app-01-portada.webp", title: "La portada: un mapa de tres pasos",
        intro: "Nadie necesita manual para empezar: la portada ES el manual. Explora los puntos y encuentra dónde arranca tu misión.",
        hotspots: [
          { x: 52.8, y: 51, t: "Importar — paso 1", d: "El primer gesto: traer la lista de tus canciones. Es el único paso que te pide algo al principio; los otros dos casi se hacen solos." },
          { x: 68.7, y: 51, t: "Analizar — paso 2", d: "Aquí trabaja la cadena de fuentes que conociste en el Acto III: memoria, identificación, ficha musical y —solo si tú quieres— audio." },
          { x: 84.6, y: 51, t: "Descargar — paso 3", d: "Las cajas etiquetadas: un ZIP con un CSV por tonalidad, el resumen general y la lista de revisión." },
          { x: 13, y: 33, t: "Sin cuentas, sin instalación", d: "Se abre en el navegador y ya está. Los tres pasos permanecen siempre visibles en la cabecera, con su marca verde al completarse." },
        ],
        reto: { type: "spot", target: 0, q: "Vas a ordenar tu playlist. Toca el lugar exacto donde empieza todo." },
      },
      {
        img: "img/app-02-importar.webp", title: "Importar: tres caminos posibles",
        intro: "Una sola pantalla, tres puertas. Cada punto es una decisión distinta — tócalos todos antes del reto.",
        hotspots: [
          { x: 18, y: 59, t: "«Abrir TuneMyMusic»", d: "Se abre en otra pestaña sin cerrar Tonalizador. Allí eliges tu plataforma, seleccionas SOLO la playlist a ordenar y la exportas a un archivo CSV (irá a tu carpeta de Descargas)." },
          { x: 34, y: 59, t: "«Ya tengo el archivo CSV →»", d: "¿Exportaste otro día? Salta directo al paso 2 sin pasar de nuevo por TuneMyMusic." },
          { x: 25, y: 67.5, t: "«Analizar una canción de mi dispositivo»", d: "El atajo para UNA canción: sin CSV. Eliges un MP3, M4A, WAV, FLAC, OGG o AAC y va directo al laboratorio acústico local." },
          { x: 68, y: 54, t: "El plan de viaje", d: "YouTube Music → un archivo CSV → Tonalizador. El CSV es solo el índice: títulos y artistas. La música nunca viaja." },
          { x: 22.5, y: 77, t: "«No necesitas configurar nada»", d: "TuneMyMusic te guía para guardar la playlist como CSV. Sin cuentas nuevas en Tonalizador ni permisos extraños." },
        ],
        reto: { type: "spot", target: 2, q: "Solo quieres saber el tono de un MP3 que ya tienes en el móvil. ¿Dónde tocarías?" },
      },
      {
        img: "img/app-03-analizar.webp", title: "Analizar: la zona de entrega",
        intro: "El paso 2 empieza pidiéndote una sola cosa: el archivo. Fíjate en las promesas que hace esta pantalla.",
        hotspots: [
          { x: 68, y: 47, t: "La zona de entrega", d: "«Elegir el archivo CSV de mi playlist» — o arrástralo hasta aquí. Debe terminar en .csv; el formato lo reconoce la app por ti (TuneMyMusic o Google Takeout)." },
          { x: 68, y: 68.5, t: "El candado", d: "«El archivo no se sube. Enviaremos título y artista solo cuando pulses Analizar.» El CSV se lee dentro de tu navegador." },
          { x: 68, y: 79, t: "El atajo, también aquí", d: "«Elegir un MP3 de mi dispositivo»: la puerta al análisis local de una sola canción existe también en esta pantalla." },
          { x: 16.5, y: 72, t: "«Puedes continuar más tarde»", d: "El progreso vive en tu navegador. Si cierras la pestaña o se corta internet, al volver continúa donde estaba." },
        ],
        reto: { type: "spot", target: 3, q: "El análisis puede cortarse a mitad (internet, cierre de pestaña…). Toca la promesa de esta pantalla que garantiza que no perderás el progreso." },
      },
      {
        img: "img/app-04-csv.webp", title: "El archivo, preparado",
        intro: "«Perfecto, Estrella.» La app leyó el CSV y te lo enseña antes de tocar nada. Tu trabajo aquí: comprobar.",
        hotspots: [
          { x: 17, y: 58, t: "El recuento", d: "«Encontramos 5 canciones.» Comprueba que cuadra con tu playlist: es tu primera oportunidad de detectar un archivo equivocado." },
          { x: 68, y: 55, t: "«Un vistazo»", d: "La lista leída del CSV, canción a canción, con su marca verde. Arriba a la derecha, el nombre del archivo (mi-playlist.csv)." },
          { x: 19, y: 69, t: "«Analizar mis canciones»", d: "El botón que lanza la cadena de fuentes. A partir de aquí, todo es automático — y cada canción volverá con su recibo." },
          { x: 34, y: 69, t: "«Elegir otro archivo»", d: "¿Te equivocaste de CSV? Cámbialo aquí mismo, sin recargar nada." },
          { x: 68, y: 70.7, t: "La letra pequeña que importa", d: "«El archivo no se sube. Al analizar, enviamos solo título y artista.» El principio «tu música no viaja», escrito en la interfaz." },
        ],
        reto: { type: "spot", target: 2, q: "Cinco canciones, recuento correcto. Toca el botón que pone a trabajar la cadena de fuentes." },
      },
      {
        img: "img/app-05-resultados.webp", title: "Tu lista completa: cada canción con su recibo",
        intro: "La pantalla más rica de la app. Arriba, el método confesado; abajo, los resultados. Hay seis puntos — y un detalle escondido en Hotel California.",
        hotspots: [
          { x: 19.5, y: 44.6, t: "Estación 1 · Caché válida", d: "«Reutilizamos un resultado vigente si ya lo calculamos.» El trabajo hecho no se repite: la segunda consulta es instantánea." },
          { x: 40, y: 44.6, t: "Estación 2 · Identificación con Spotify", d: "«Confirmamos que es la canción y la versión correctas.» El DNI de la grabación, antes de preguntar nada más." },
          { x: 60, y: 44.6, t: "Estación 3 · Tonalidad con ReccoBeats", d: "«Obtenemos la tonalidad y los BPM de la grabación.» La enciclopedia especializada, consultada con el DNI en la mano." },
          { x: 80.5, y: 44.6, t: "Estación 4 · Audio, solo si tú lo decides", d: "«Si falta la tonalidad o es dudosa, puedes analizar un archivo local para esa canción.» El especialista, únicamente bajo demanda." },
          { x: 83.6, y: 55.8, t: "El resultado en tres idiomas", d: "Do menor · Cm · Camelot 5A · 143 BPM. Español para leer, notación internacional para comparar, Camelot para mezclar. Los tres nombres de la misma casa." },
          { x: 33.6, y: 95.8, t: "La regla del remaster, en vivo", d: "Hotel California: «la única diferencia es que el catálogo identifica una remasterización». Misma grabación con el sonido pulido → continúa. Un directo o un cover jamás pasarían solos." },
        ],
        reto: { type: "spot", target: 5, q: "Hotel California llegó al catálogo como «remasterización»… y aun así pasó el control. Toca el recibo donde la app lo confiesa." },
      },
      {
        img: "img/app-06-revision.webp", title: "El caso honesto: «Sin tonalidad»",
        intro: "Nuestra canción inventada no existe en ningún catálogo. Observa cómo responde la app: sin inventar, sin esconder.",
        hotspots: [
          { x: 83.6, y: 71, t: "«Sin tonalidad»", d: "El hueco honesto, en ámbar. Ninguna fuente automática dio un dato fiable — y ningún porcentaje fue inventado para rellenar." },
          { x: 16.5, y: 79, t: "«No la encontramos»", d: "«La búsqueda automática no obtuvo una tonalidad suficientemente fiable. No aparece en nuestra búsqueda.» El recibo, también cuando no hay premio." },
          { x: 73, y: 78.6, t: "«Analizar audio»", d: "Solo en esta fila: elige el archivo de ESTA canción y tu navegador la escuchará localmente. «Analiza la canción completa. Puede tardar varios minutos y el audio no sale del navegador.»" },
          { x: 43, y: 89.5, t: "Transparencia y privacidad", d: "«Para la búsqueda automática enviamos título y artista. Si eliges Analizar audio, ese archivo se procesa en este navegador, no se sube y no se conserva.»" },
        ],
        reto: { type: "spot", target: 2, q: "Esta canción no apareció por ningún lado. Toca el único sitio donde la app se ofrece a escucharla en tu dispositivo." },
      },
      {
        img: "img/app-07-audio.webp", title: "El laboratorio local, en producción",
        intro: "Le dimos un archivo de audio de verdad. Este es el veredicto del análisis que practicaste en el Experimento 9 — con su duda medida y confesada.",
        hotspots: [
          { x: 28, y: 23, t: "«Conviene comprobar el resultado»", d: "La app no vende certezas: «el cálculo no ha sido suficientemente claro. Puedes probar con otro archivo o corregir la tonalidad manualmente.»" },
          { x: 30, y: 38, t: "«Tu MP3 no sale del dispositivo»", d: "«Se decodifica y analiza únicamente en este navegador; no se sube ni se conserva.» La promesa del laboratorio, cumplida en producción." },
          { x: 83.6, y: 46.3, t: "El veredicto", d: "Do Mayor · C · Camelot 8B — obtenido pesando las 12 notas del archivo y comparando con los 24 patrones, exactamente como en el Experimento 9." },
          { x: 24, y: 52.3, t: "«Confirma esta» · Confianza tonal 81 %", d: "El resultado llega con su confianza medida y una etiqueta prudente. La última palabra es tuya — nunca de la máquina." },
          { x: 35, y: 59.6, t: "El método, al desnudo", d: "Perfil cromático local (local_hpcp_v2_full) · 24 s analizados · canción completa en 5 tramos… y el voto de cada tramo, discrepancias incluidas: el tramo 5–10 s votó La menor (75 %)." },
          { x: 73, y: 54, t: "«Analizar otro archivo»", d: "¿Tienes una versión mejor grabada de la misma canción? Repite el análisis con otro archivo cuando quieras." },
        ],
        reto: { type: "spot", target: 4, q: "La app no esconde su método: en algún lugar enseña los 5 tramos analizados y el voto de cada uno, discrepancias incluidas. Tócalo." },
      },
      {
        img: "img/app-08-descargar.webp", title: "Descargar: el anillo honesto",
        intro: "Última escena. Un resumen que no redondea: 4 de 5, un 80 % — y el 20 % restante, esperando tu mirada.",
        hotspots: [
          { x: 54, y: 41.2, t: "El anillo honesto", d: "«80 % ordenado»: 4 de 5 canciones. El hueco es visible por diseño — nada entra a escondidas en tus listas." },
          { x: 70, y: 60.6, t: "Tus nuevas listas", d: "Re Mayor, Sol sostenido Mayor, Do menor, Si menor… una caja por tonalidad, conservando el orden original de tu playlist." },
          { x: 19.6, y: 64.5, t: "«Descargar todas las listas»", d: "Un único ZIP: un CSV por tonalidad + resumen.csv + revisar.csv (solo si hace falta). Para volver a YouTube Music: TuneMyMusic, en sentido inverso." },
          { x: 27, y: 74.9, t: "«1 canción necesita una mirada»", d: "El aviso ámbar: puedes volver a Analizar y pedir el análisis acústico individual, o fijar tú la tonalidad a mano. Tú decides; la app espera." },
        ],
        reto: { type: "spot", target: 3, q: "Una canción quedó fuera de las listas y la app no lo disimula. Toca el aviso que te lo cuenta." },
      },
    ];

    /* Retos finales: sin imagen, sin lupa — las respuestas ya viven en tu cabeza */
    const FINALS = [
      {
        q: "Se te corta internet a mitad del análisis de 300 canciones. ¿Qué pasa con tu progreso?",
        opts: ["Se pierde y hay que empezar de cero", "Se guarda solo en tu navegador: al volver, continúa donde estaba", "Hay que volver a exportar el CSV desde TuneMyMusic"],
        right: 1,
        expl: "Es la promesa escrita en la pantalla de Analizar: «puedes continuar más tarde». El estado se guarda automáticamente en tu navegador.",
      },
      {
        q: "El recibo de Hotel California menciona una «remasterización»… y aun así la deja pasar. ¿Por qué?",
        opts: ["Porque es la versión más popular del catálogo", "Porque es la misma grabación con el sonido pulido: la tonalidad no cambia", "Porque los directos y los estudios suenan igual"],
        right: 1,
        expl: "Limpiar el cristal no cambia el color de la habitación. Directos, remixes, acústicos y covers, en cambio, van siempre a revisión — pueden estar en otro tono.",
      },
      {
        q: "Un tramo votó «La menor» y el veredicto global es «Do Mayor, 81 %» con la etiqueta «Confirma esta». ¿Qué está haciendo la app?",
        opts: ["Equivocarse: debería ocultar los tramos que discrepan", "Medir la duda y enseñártela, dejándote la última palabra", "Elegir una tonalidad al azar entre las dos"],
        right: 1,
        expl: "Es la fórmula del laboratorio en producción: parecido + ventaja + nitidez + acuerdo entre tramos. La discrepancia baja la confianza… y se muestra, no se esconde.",
      },
      {
        q: "El anillo de Descargar marca 80 % y no 100 %. ¿Por qué es una buena señal?",
        opts: ["Porque la app falló y lo admite a regañadientes", "Porque prefirió dejar un hueco visible antes que colar un error en tus listas", "Porque faltó conexión a internet"],
        right: 1,
        expl: "«Mejor decir no lo sé que equivocarse en silencio.» El 20 % restante te espera en revisar.csv — con la última palabra para ti.",
      },
    ];

    let cur = 0;
    let fails = 0;
    let finalShown = false;
    const solved = new Array(TOUR.length).fill(false);
    const finalsSolved = new Array(FINALS.length).fill(false);
    const visited = TOUR.map(s => new Set());
    const PTS_OK = 100, PTS_FAIL = 25;
    const TOTAL_STEPS = TOUR.length + 1;               // 8 escenas + ronda final
    const TOTAL_RETOS = TOUR.length + FINALS.length;   // 12 retos
    const NAME_KEY = "tonalizador-tutorial:nombre";

    /* El marcador (aciertos/fallos/puntos) ya no se guarda entre visitas:
       cada vez que se llega a la misión, arranca a cero por diseño. */
    function saveGame() {}

    root.innerHTML = `
      <div class="tour-body">
        <div class="tour-stage" id="tour-stage"></div>
        <div class="tour-side">
          <div class="tour-head">
            <div class="tour-title"><span class="n" id="tour-n"></span><span id="tour-t"></span></div>
            <div class="tour-progress" id="tour-progress" role="tablist" aria-label="Escenas"></div>
          </div>
          <div class="tour-hud">
            <span class="hud-msg">🎮 Supera los <b>12 retos</b> (8 escenas + 4 finales) · acierto <b class="ok">+${PTS_OK}</b> · fallo <b class="bad">−${PTS_FAIL}</b></span>
            <div class="hud-board" role="status" aria-label="Marcador">
              <span class="hud-stat ok" title="Retos superados">✓ <b id="hud-ok">0</b></span>
              <span class="hud-stat bad" title="Fallos">✗ <b id="hud-fail">0</b></span>
              <span class="hud-stat pts" title="Puntos">★ <b id="hud-pts">0</b></span>
            </div>
            <div class="hud-actions">
              <button class="btn hud-ctl" id="tour-fs" type="button" title="Pantalla completa (las flechas ← → cambian de escena)">⛶ Pantalla completa</button>
              <button class="btn hud-ctl" id="hud-reset" type="button" title="Vuelve a empezar la misión con el marcador a cero">↺ Reiniciar marcador</button>
              <button class="btn hud-ctl gold" id="hud-diploma" type="button" hidden title="Vuelve a abrir tu diploma">🎓 Mi diploma</button>
            </div>
          </div>
          <div class="tour-reto" id="tour-reto"></div>
          <div class="tour-nav">
            <button class="btn" id="tour-prev" type="button">← Anterior</button>
            <button class="btn btn-primary" id="tour-next" type="button">Siguiente →</button>
            <button class="tour-continue" id="tour-continue" type="button" hidden>Seguir viendo el tutorial ↓</button>
          </div>
        </div>
        <!-- El diploma va SOBRE el tablero, no dentro de la columna:
             si se insertara en el flujo, empujaría la captura fuera de la pantalla. -->
        <div class="tour-final" id="tour-final" hidden></div>
      </div>`;

    const stage = $("#tour-stage"), retoBox = $("#tour-reto");

    /* ---------- Lupa sobre la captura (solo dispositivos con cursor) ---------- */
    const canHover = matchMedia("(hover: hover) and (pointer: fine)").matches;
    const LENS_ZOOM = 2.3, LENS_SIZE = 200;
    if (canHover) {
      stage.addEventListener("mousemove", e => {
        if (cur >= TOUR.length) return; // en la ronda final no hay imagen ni lupa
        let lens = stage.querySelector(".tour-lens");
        if (!lens) {
          lens = document.createElement("div");
          lens.className = "tour-lens";
          stage.appendChild(lens);
        }
        const rect = stage.getBoundingClientRect();
        const x = e.clientX - rect.left, y = e.clientY - rect.top;
        if (x < 0 || y < 0 || x > rect.width || y > rect.height) { lens.classList.remove("on"); return; }
        lens.style.backgroundImage = `url("${TOUR[cur].img}")`;
        lens.style.backgroundSize = `${rect.width * LENS_ZOOM}px ${rect.height * LENS_ZOOM}px`;
        lens.style.left = `${x - LENS_SIZE / 2}px`;
        lens.style.top = `${y - LENS_SIZE / 2}px`;
        lens.style.backgroundPosition = `${-(x * LENS_ZOOM - LENS_SIZE / 2)}px ${-(y * LENS_ZOOM - LENS_SIZE / 2)}px`;
        lens.classList.add("on");
      });
      stage.addEventListener("mouseleave", () => stage.querySelector(".tour-lens")?.classList.remove("on"));
    }
    const progress = $("#tour-progress");
    TOUR.forEach((s, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = i + 1;
      b.setAttribute("aria-label", `Escena ${i + 1}: ${s.title}`);
      b.addEventListener("click", () => go(i));
      progress.appendChild(b);
    });
    const finalsBtn = document.createElement("button");
    finalsBtn.type = "button";
    finalsBtn.textContent = "★";
    finalsBtn.setAttribute("aria-label", "Ronda final: cuatro preguntas");
    finalsBtn.addEventListener("click", () => go(TOUR.length));
    progress.appendChild(finalsBtn);
    // precargar imágenes
    TOUR.forEach(s => { const im = new Image(); im.src = s.img; });

    const soundOK = () => AE.playSequence([
      { midis: [72], at: 0, dur: 0.16, vel: 0.5 }, { midis: [76], at: 0.09, dur: 0.16, vel: 0.5 },
      { midis: [79], at: 0.18, dur: 0.2, vel: 0.55 }, { midis: [84], at: 0.28, dur: 0.55, vel: 0.6 },
    ]);
    /* Fallo: un pitido corto y descendente, inmediato al clic. */
    const soundNo = () => AE.playBuzz();
    const soundFanfare = () => AE.playSequence([
      { midis: [60, 64, 67], at: 0, dur: 0.3, vel: 0.7 }, { midis: [62, 65, 69], at: 0.28, dur: 0.3, vel: 0.7 },
      { midis: [64, 67, 71], at: 0.56, dur: 0.3, vel: 0.75 }, { midis: [60, 64, 67, 72], at: 0.86, dur: 1.4, vel: 0.85 },
      { midis: [84], at: 1.0, dur: 0.9, vel: 0.5 },
    ]);

    const solvedCount = () => solved.filter(Boolean).length + finalsSolved.filter(Boolean).length;
    const points = () => Math.max(0, solvedCount() * PTS_OK - fails * PTS_FAIL);

    function updateHUD() {
      $("#hud-ok").textContent = solvedCount();
      $("#hud-fail").textContent = fails;
      const ptsEl = $("#hud-pts");
      ptsEl.textContent = points();
      const stat = ptsEl.closest(".hud-stat");
      stat.classList.remove("bump");
      requestAnimationFrame(() => stat.classList.add("bump"));
    }
    const score = updateHUD;

    function rankFor(p) {
      if (p >= 1200) return ["🏆", "Matrícula de honor", "Doce retos, cero tropiezos: dominas el Tonalizador de cabo a rabo."];
      if (p >= 950) return ["🥇", "Sobresaliente", "La app ya no tiene secretos para ti; los tropiezos fueron anécdota."];
      if (p >= 700) return ["🥈", "Notable", "Comprensión sólida. Un repaso a las escenas donde fallaste y quedará redondo."];
      return ["🎓", "Misión cumplida", "Has llegado al final. Pon el marcador a cero y bate tu propia puntuación: el segundo viaje siempre se ve más claro."];
    }

    /* El diploma acredita los 12 retos: sin ellos no se emite. Se comprueba
       aquí, en un único sitio, y no en cada botón que pueda abrir la tarjeta.
       (Antes bastaba con pulsar «Seguir viendo el tutorial ↓» en la ronda
       final para que apareciera el botón «🎓 Mi diploma» con el marcador a
       cero: cerrar la tarjeta lo mostraba sin preguntar nada.) */
    const isComplete = () => solved.every(Boolean) && finalsSolved.every(Boolean);

    /* Primer reto pendiente: a donde llevar a quien aún no ha terminado. */
    const firstPending = () => {
      const i = solved.findIndex(v => !v);
      return i === -1 ? TOUR.length : i;
    };

    function syncDiplomaBtn() {
      const db = $("#hud-diploma");
      if (db) db.hidden = !isComplete();
    }

    function closeFinalBanner() {
      const fin = $("#tour-final");
      if (fin) fin.hidden = true;
      syncDiplomaBtn();   // se puede reabrir cuando quieras… si está ganado
    }

    /* Misión terminada → seguir con el tutorial: cierra el diploma, sale de
       pantalla completa y viaja a «La chuleta: los tres gestos en frío». */
    function goChuleta() {
      closeFinalBanner();
      exitFs();
      const target = document.getElementById("chuleta");
      if (!target) return;
      /* Pequeña espera: el navegador tarda unos fotogramas en devolver la
         página a su tamaño normal, y desplazarse antes descoloca el destino. */
      setTimeout(() => target.scrollIntoView({ behavior: "smooth", block: "start" }), 280);
    }

    /* El puente de vuelta: el modo rápido termina con una puerta abierta
       hacia el Acto I, no con un diploma y punto. */
    function goViaje() {
      closeFinalBanner();
      exitFs();
      const target = document.getElementById("acto-1");
      if (!target) return;
      /* Misma espera que goChuleta: dejar que la página recupere su tamaño. */
      setTimeout(() => target.scrollIntoView({ behavior: "smooth", block: "start" }), 280);
    }

    /* Aviso cuando se pide el diploma antes de tiempo: mismo formato de
       tarjeta que el diploma, pero con la puerta cerrada y el camino señalado. */
    function showLockedBanner() {
      const done = solvedCount();
      const faltan = TOTAL_RETOS - done;
      const fin = $("#tour-final");
      fin.hidden = false;
      fin.innerHTML = `<div class="tf-card">
        <button class="tf-close" id="tf-close" type="button" aria-label="Cerrar y volver al tablero">✕</button>
        <span class="tf-emoji">🔒</span>
        <div class="tf-text"><strong>El diploma todavía no</strong><br>
        <span>Para obtener el diploma hay que superar los <b>${TOTAL_RETOS} retos</b> de la misión
        (${TOUR.length} escenas + ${FINALS.length} finales). Llevas <b>${done} de ${TOTAL_RETOS}</b>:
        te ${faltan === 1 ? "queda <b>1 reto</b>" : `quedan <b>${faltan} retos</b>`}.</span>
        <p class="tf-hint">Un diploma que se da sin terminar la misión no acredita nada.
        Termina los retos que faltan y la tarjeta se abrirá sola.</p>
        <button class="tf-back" id="tf-seguir" type="button">Seguir con la misión →</button></div></div>`;

      $("#tf-close").addEventListener("click", closeFinalBanner);
      $("#tf-seguir").addEventListener("click", () => { closeFinalBanner(); go(firstPending()); });
      fin.addEventListener("click", e => { if (e.target === fin) closeFinalBanner(); });
    }

    function showFinalBanner(silent) {
      /* Puerta única: cualquier camino hacia el diploma pasa por aquí. */
      if (!isComplete()) { showLockedBanner(); return; }
      const p = points();
      const [emoji, title, text] = rankFor(p);
      const fin = $("#tour-final");
      fin.hidden = false;
      fin.innerHTML = `<div class="tf-card">
        <button class="tf-close" id="tf-close" type="button" aria-label="Cerrar y volver al tablero">✕</button>
        <span class="tf-emoji">${emoji}</span>
        <div class="tf-text"><strong>${title} — ${p} puntos</strong> (${fails} ${fails === 1 ? "fallo" : "fallos"})<br>
        <span>${text}</span>
        <div class="tf-diploma">
          <input id="tf-name" type="text" maxlength="38" placeholder="Escribe tu nombre"
                 aria-label="Tu nombre para el diploma" autocomplete="name" required>
          <button class="btn btn-primary" id="tf-dip" type="button" disabled>🎓 Descargar diploma</button>
          <button class="btn" id="tf-again" type="button">↺ Volver a jugar</button>
        </div>
        <p class="tf-hint" id="tf-hint">El diploma va a tu nombre: escríbelo para poder descargarlo.</p>
        <div class="tf-bridge">
          <strong>Ya dominas los tres gestos.</strong> ¿Quieres saber ahora <em>por qué</em> funcionan —
          qué significa de verdad ese código, el reloj de 24 tonalidades, la máquina que a veces duda?<br>
          <button class="btn btn-primary" id="tf-viaje" type="button">✦ Empezar el viaje completo</button>
        </div>
        <button class="tf-back" id="tf-back" type="button">Seguir viendo el tutorial</button></div></div>`;

      $("#tf-viaje").addEventListener("click", goViaje);
      $("#tf-again").addEventListener("click", resetGame);
      $("#tf-close").addEventListener("click", closeFinalBanner);
      $("#tf-back").addEventListener("click", goChuleta);
      /* Clic en el fondo oscuro (fuera de la tarjeta) = cerrar */
      fin.addEventListener("click", e => { if (e.target === fin) closeFinalBanner(); });

      const nameInput = $("#tf-name"), dipBtn = $("#tf-dip"), hint = $("#tf-hint");
      nameInput.value = Store.get(NAME_KEY, "") || "";
      const validName = () => nameInput.value.trim().length >= 2;
      const syncName = () => {
        const ok = validName();
        dipBtn.disabled = !ok;
        hint.hidden = ok;
      };
      nameInput.addEventListener("input", syncName);
      syncName();

      dipBtn.addEventListener("click", () => {
        if (!validName()) { nameInput.focus(); return; }
        const name = nameInput.value.trim();
        Store.set(NAME_KEY, name);
        downloadDiploma(name, p, emoji, title);
      });
      nameInput.addEventListener("keydown", e => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        if (validName()) dipBtn.click(); else hint.hidden = false;
      });
      /* Nada de scrollIntoView: la tarjeta ya está centrada sobre el tablero.
         Al desplazar el panel se empujaba la captura fuera de la pantalla. */
      if (!silent) setTimeout(() => nameInput.focus({ preventScroll: true }), 60);
    }

    function checkFinal() {
      if (finalShown || !solved.every(Boolean) || !finalsSolved.every(Boolean)) return;
      finalShown = true;
      soundFanfare();
      showFinalBanner(false);
    }

    function resetGame() {
      fails = 0;
      finalShown = false;
      solved.fill(false);
      finalsSolved.fill(false);
      visited.forEach(v => v.clear());
      $("#tour-final").hidden = true;
      syncDiplomaBtn();   // marcador a cero → el diploma vuelve a esconderse
      const rb = $("#hud-reset");
      if (rb) { rb.textContent = "↺ Reiniciar marcador"; rb.classList.remove("danger"); }
      saveGame();
      updateHUD();
      go(0);
    }

    /* ---------- Diploma: un recuerdo del viaje, dibujado en tu navegador ---------- */

    async function downloadDiploma(name, pts, emoji, rank) {
      try { await document.fonts.ready; } catch (_) { /* fuentes de sistema */ }
      const W = 1240, H = 860;
      const c = document.createElement("canvas");
      c.width = W; c.height = H;
      const x = c.getContext("2d");

      const bg = x.createLinearGradient(0, 0, W, H);
      bg.addColorStop(0, "#080a16");
      bg.addColorStop(1, "#0d1226");
      x.fillStyle = bg;
      x.fillRect(0, 0, W, H);

      const glow = x.createRadialGradient(W * 0.82, 40, 0, W * 0.82, 40, 620);
      glow.addColorStop(0, "rgba(139,124,255,0.30)");
      glow.addColorStop(1, "rgba(139,124,255,0)");
      x.fillStyle = glow;
      x.fillRect(0, 0, W, H);

      const glow2 = x.createRadialGradient(W * 0.1, H, 0, W * 0.1, H, 560);
      glow2.addColorStop(0, "rgba(76,201,240,0.22)");
      glow2.addColorStop(1, "rgba(76,201,240,0)");
      x.fillStyle = glow2;
      x.fillRect(0, 0, W, H);

      // Cielo de fondo
      for (let i = 0; i < 90; i++) {
        const sx = (i * 8191 % W), sy = (i * 5233 % H);
        x.globalAlpha = 0.05 + ((i * 37) % 20) / 100;
        x.fillStyle = "#e8eaf2";
        x.beginPath();
        x.arc(sx, sy, ((i % 3) + 1) * 0.7, 0, Math.PI * 2);
        x.fill();
      }
      x.globalAlpha = 1;

      // Marco
      x.strokeStyle = "rgba(255,184,107,0.55)";
      x.lineWidth = 2;
      x.strokeRect(34, 34, W - 68, H - 68);
      x.strokeStyle = "rgba(255,255,255,0.10)";
      x.lineWidth = 1;
      x.strokeRect(46, 46, W - 92, H - 92);

      // La constelación de las 12 notas, orbitando su estrella-hogar
      const cx = W / 2, cy = 246, R = 82;
      for (let pc = 0; pc < 12; pc++) {
        const a = (pc / 12) * Math.PI * 2 - Math.PI / 2;
        const px = cx + Math.cos(a) * R, py = cy + Math.sin(a) * R * 0.52;
        x.strokeStyle = "rgba(139,124,255,0.18)";
        x.lineWidth = 1;
        x.beginPath(); x.moveTo(px, py); x.lineTo(cx, cy); x.stroke();
        x.fillStyle = T.pitchColor(pc, 0.9);
        x.beginPath(); x.arc(px, py, 4.6, 0, Math.PI * 2); x.fill();
      }
      x.fillStyle = "rgba(255,184,107,0.98)";
      x.shadowColor = "rgba(255,184,107,0.9)";
      x.shadowBlur = 28;
      x.beginPath(); x.arc(cx, cy, 9, 0, Math.PI * 2); x.fill();
      x.shadowBlur = 0;

      const center = (text, y, font, fill, spacing = 0) => {
        x.font = font;
        x.fillStyle = fill;
        x.textAlign = "center";
        if (!spacing) { x.fillText(text, W / 2, y); return; }
        const chars = [...text];
        const widths = chars.map(ch => x.measureText(ch).width + spacing);
        let start = W / 2 - widths.reduce((a, b) => a + b, 0) / 2;
        chars.forEach((ch, i) => { x.fillText(ch, start + widths[i] / 2, y); start += widths[i]; });
      };

      center("TONALIZADOR · EL VIAJE", 112, "700 19px Inter, system-ui, sans-serif", "rgba(76,201,240,0.95)", 6);
      center("Misión guiada superada", 168, "560 34px Fraunces, Georgia, serif", "rgba(232,234,242,0.72)");

      center(emoji, 392, "72px system-ui, sans-serif", "#fff");
      // El nombre largo se encoge para no salirse del marco
      x.font = "700 60px Fraunces, Georgia, serif";
      let nameSize = 60;
      while (nameSize > 30 && x.measureText(name).width > W - 220) {
        nameSize -= 2;
        x.font = `700 ${nameSize}px Fraunces, Georgia, serif`;
      }
      center(name, 476, `700 ${nameSize}px Fraunces, Georgia, serif`, "#ffffff");

      center("ha completado los 12 retos y comprende cómo piensa el Tonalizador:",
        528, "400 20px Inter, system-ui, sans-serif", "rgba(167,171,189,0.95)");
      center("qué es una tonalidad, cómo la mide una máquina y por qué a veces duda.",
        558, "400 20px Inter, system-ui, sans-serif", "rgba(167,171,189,0.95)");

      // Medallas de datos
      const stats = [
        [String(pts), "PUNTOS"],
        [rank, "VALORACIÓN"],
        [`${fails}`, fails === 1 ? "FALLO" : "FALLOS"],
      ];
      const boxW = 300, gap = 26, totalW = stats.length * boxW + (stats.length - 1) * gap;
      let bx = W / 2 - totalW / 2;
      stats.forEach(([big, small]) => {
        x.fillStyle = "rgba(255,255,255,0.045)";
        x.strokeStyle = "rgba(255,255,255,0.14)";
        x.lineWidth = 1;
        const by = 622, bh = 98;
        x.beginPath();
        if (x.roundRect) x.roundRect(bx, by, boxW, bh, 14); else x.rect(bx, by, boxW, bh);
        x.fill(); x.stroke();
        x.textAlign = "center";
        x.font = "700 34px Fraunces, Georgia, serif";
        x.fillStyle = "#ffd7a1";
        x.fillText(big, bx + boxW / 2, by + 46);
        x.font = "700 13px Inter, system-ui, sans-serif";
        x.fillStyle = "rgba(167,171,189,0.9)";
        x.fillText(small, bx + boxW / 2, by + 74);
        bx += boxW + gap;
      });

      const fecha = new Date().toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
      center(`Expedido el ${fecha} · tonalizador.xosemiguel.eu`,
        784, "400 16px Inter, system-ui, sans-serif", "rgba(109,114,132,0.95)");

      const slug = (name || "explorador").toLowerCase()
        .normalize("NFD").replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "explorador";
      c.toBlob(blob => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `diploma-tonalizador-${slug}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      }, "image/png");
    }

    function closeCallout() {
      stage.querySelector(".hs-callout")?.remove();
      stage.querySelectorAll(".hs").forEach(x => x.classList.remove("sel"));
    }

    /** Globo de información anclado junto al punto pulsado. */
    function showCallout(h, dotEl) {
      closeCallout();
      const box = document.createElement("div");
      box.className = "hs-callout";
      box.setAttribute("role", "status");
      box.innerHTML = `<button class="cx" type="button" aria-label="Cerrar">✕</button>
        <p class="ct">${h.t}</p><p class="cd">${h.d}</p>`;
      stage.appendChild(box);
      // posicionar junto al punto, sin salirse de la captura
      const sw = stage.clientWidth, sh = stage.clientHeight;
      const px = (h.x / 100) * sw, py = (h.y / 100) * sh;
      const bw = Math.min(320, sw * 0.86);
      const left = Math.max(8, Math.min(px - bw / 2, sw - bw - 8));
      box.style.left = left + "px";
      requestAnimationFrame(() => {
        const bh = box.offsetHeight;
        if (py > sh * 0.55 || py + 24 + bh > sh - 8) {
          box.style.top = Math.max(8, py - bh - 22) + "px";
        } else {
          box.style.top = (py + 22) + "px";
        }
      });
      box.querySelector(".cx").addEventListener("click", e => { e.stopPropagation(); closeCallout(); });
      dotEl.classList.add("sel");
    }

    function renderReto() {
      const scene = TOUR[cur];
      const r = scene.reto;
      retoBox.classList.toggle("solved", solved[cur]);
      if (solved[cur]) {
        retoBox.innerHTML = `<h5>Reto superado ✓ (+${PTS_OK})</h5><p class="q">${r.q}</p><p>${r.type === "mc" ? r.expl : "Encontrado. Los demás puntos siguen ahí para explorar, ya sin penalización."}</p>`;
        return;
      }
      if (r.type === "spot") {
        retoBox.innerHTML = `<h5>🎯 Reto de la escena</h5><p class="q">${r.q}</p>
          <p>Toca el punto correcto sobre la captura. Cada fallo resta ${PTS_FAIL} puntos.</p>`;
      } else {
        retoBox.innerHTML = `<h5>Reto de la escena</h5><p class="q">${r.q}</p>
          <div class="opts">${r.opts.map((o, i) => `<button class="opt" data-i="${i}" type="button">${o}</button>`).join("")}</div>
          <p class="expl">${r.expl}</p>`;
        retoBox.querySelectorAll(".opt").forEach(b => b.addEventListener("click", () => {
          const i = parseInt(b.dataset.i, 10);
          if (i === r.right) {
            b.classList.add("right");
            solved[cur] = true;
            soundOK();
            retoBox.querySelectorAll(".opt").forEach(x => x.disabled = true);
            retoBox.querySelector(".expl").classList.add("show");
            retoBox.classList.add("solved");
            paintProgress();
            updateHUD();
            saveGame();
            checkFinal();
          } else {
            b.classList.add("wrong");
            b.disabled = true;
            fails++;
            soundNo();
            updateHUD();
            saveGame();
          }
        }));
      }
    }

    function paintProgress() {
      Array.from(progress.children).forEach((b, i) => {
        b.classList.toggle("cur", i === cur);
        if (i === TOUR.length) {
          const allF = finalsSolved.every(Boolean);
          b.classList.toggle("done", allF);
          b.textContent = allF ? "✓" : "★";
        } else {
          b.classList.toggle("done", solved[i]);
          b.textContent = solved[i] ? "✓" : i + 1;
        }
      });
    }

    function renderFinals() {
      stage.classList.add("finals");
      $("#tour-n").textContent = "Ronda final";
      $("#tour-t").textContent = "Cuatro preguntas para rematar la misión";
      stage.innerHTML = `<div class="finals-grid">` + FINALS.map((f, i) => `
        <div class="tour-reto final-card${finalsSolved[i] ? " solved" : ""}" data-f="${i}">
          <h5>Reto final ${i + 1} de ${FINALS.length}${finalsSolved[i] ? " · superado ✓" : ""}</h5>
          <p class="q">${f.q}</p>
          ${finalsSolved[i]
            ? `<p>${f.expl}</p>`
            : `<details class="opts-fold"><summary>Elegir respuesta</summary>
                 <div class="opts">${f.opts.map((o, j) => `<button class="opt" data-i="${j}" type="button">${o}</button>`).join("")}</div>
               </details>
               <p class="expl">${f.expl}</p>`}
        </div>`).join("") + `</div>`;

      const counter = () => {
        const done = finalsSolved.filter(Boolean).length;
        retoBox.classList.remove("solved");
        retoBox.innerHTML = `<h5>Ronda final</h5>
          <p class="q">Retos superados: ${done} de ${FINALS.length}</p>
          <p>Responde las preguntas del panel grande, en el orden que quieras. Aquí ya no hay imagen que mirar:
          las respuestas viven en lo que aprendiste en las ocho escenas.</p>`;
      };
      counter();

      stage.querySelectorAll(".final-card").forEach(card => {
        const fi = parseInt(card.dataset.f, 10);
        const f = FINALS[fi];
        card.querySelectorAll(".opt").forEach(b => b.addEventListener("click", () => {
          const j = parseInt(b.dataset.i, 10);
          if (j === f.right) {
            b.classList.add("right");
            finalsSolved[fi] = true;
            soundOK();
            card.querySelectorAll(".opt").forEach(x => x.disabled = true);
            card.querySelector(".expl").classList.add("show");
            card.classList.add("solved");
            card.querySelector("h5").textContent = `Reto final ${fi + 1} de ${FINALS.length} · superado ✓ (+${PTS_OK})`;
            paintProgress();
            updateHUD();
            saveGame();
            counter();
            checkFinal();
          } else {
            b.classList.add("wrong");
            b.disabled = true;
            fails++;
            soundNo();
            updateHUD();
            saveGame();
          }
        }));
      });

      paintProgress();
      $("#tour-prev").disabled = false;
      $("#tour-next").textContent = "Volver al principio ↻";
      $("#tour-continue").hidden = false;
    }

    function go(i) {
      cur = (i + TOTAL_STEPS) % TOTAL_STEPS;
      if (cur === TOUR.length) { renderFinals(); return; }
      stage.classList.remove("finals");
      const scene = TOUR[cur];
      $("#tour-n").textContent = `Escena ${cur + 1}/${TOUR.length}`;
      $("#tour-t").textContent = scene.title;
      stage.innerHTML = `<img src="${scene.img}" alt="Captura real de la aplicación: ${scene.title}">`;
      scene.hotspots.forEach((h, hi) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "hs" + (visited[cur].has(hi) ? " visited" : "");
        b.style.left = h.x + "%";
        b.style.top = h.y + "%";
        b.setAttribute("aria-label", h.t);
        b.addEventListener("click", e => {
          e.stopPropagation();
          visited[cur].add(hi);
          showCallout(h, b);
          const r = scene.reto;
          if (r.type === "spot" && !solved[cur]) {
            if (hi === r.target) {
              b.classList.add("correct");
              solved[cur] = true;
              soundOK();
              paintProgress();
              updateHUD();
              saveGame();
              renderReto();
              checkFinal();
              b.classList.add("visited");
              return;
            }
            fails++;
            soundNo();
            updateHUD();
            saveGame();
            const hint = retoBox.querySelector(".hint");
            if (hint) hint.textContent = `−${PTS_FAIL} · Ese tampoco era (${fails} fallos ya). Respira, mira la captura… y vuelve a intentarlo.`;
            else retoBox.querySelector(".q")?.insertAdjacentHTML("afterend",
              `<p class="hint" style="color:var(--warn);font-size:12.5px;margin:0 0 8px">−${PTS_FAIL} puntos · Ese no era. El globo te cuenta qué es; el reto sigue abierto.</p>`);
          }
          b.classList.add("visited");
        });
        stage.appendChild(b);
      });
      stage.addEventListener("click", e => { if (e.target.tagName === "IMG") closeCallout(); });
      renderReto();
      paintProgress();
      $("#tour-prev").disabled = cur === 0;
      $("#tour-next").textContent = cur === TOUR.length - 1 ? "Retos finales ★" : "Siguiente →";
      $("#tour-continue").hidden = true; // solo se ofrece en la ronda final
    }

    $("#tour-prev").addEventListener("click", () => go(cur - 1));
    $("#tour-next").addEventListener("click", () => go(cur + 1));

    /* Cerrar el diploma no lo pierde: se reabre desde el marcador. */
    $("#hud-diploma").addEventListener("click", () => showFinalBanner(true));
    $("#tour-continue").addEventListener("click", goChuleta);

    /* Reiniciar pide confirmación si hay algo que perder */
    const resetBtn = $("#hud-reset");
    const RESET_LABEL = "↺ Reiniciar marcador";
    let resetArmed = false, resetTimer = null;
    function disarmReset() {
      clearTimeout(resetTimer);
      resetArmed = false;
      resetBtn.textContent = RESET_LABEL;
      resetBtn.classList.remove("danger");
    }
    resetBtn.addEventListener("click", () => {
      const hayProgreso = solvedCount() > 0 || fails > 0;
      if (!hayProgreso) { resetGame(); return; }
      if (!resetArmed) {
        resetArmed = true;
        resetBtn.textContent = "¿Seguro? Pulsa otra vez";
        resetBtn.classList.add("danger");
        resetTimer = setTimeout(disarmReset, 4000);
        return;
      }
      disarmReset();
      resetGame();
    });

    /* ---------- Pantalla completa: la captura, en primera fila ---------- */
    const panel = $("#tour-panel");
    const fsBtn = $("#tour-fs");
    const fsSupported = !!(panel.requestFullscreen || panel.webkitRequestFullscreen);
    const FS_KEY = "tonalizador-tutorial:sin-pantalla-completa";
    let fsOffered = false;
    let fsOptOut = !!Store.get(FS_KEY, false);

    const isFs = () => (document.fullscreenElement || document.webkitFullscreenElement) === panel;

    async function enterFs() {
      if (!fsSupported || isFs()) return isFs();
      try {
        await (panel.requestFullscreen || panel.webkitRequestFullscreen).call(panel);
        return true;
      } catch (_) {
        return false; // el navegador exige un gesto del usuario
      }
    }

    function exitFs() {
      if (isFs()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    }

    if (!fsSupported) fsBtn.style.display = "none";
    fsBtn.addEventListener("click", () => { isFs() ? exitFs() : enterFs(); });

    const syncFs = () => {
      const on = isFs();
      fsBtn.textContent = on ? "⤡" : "⛶";
      fsBtn.title = on ? "Salir de pantalla completa (Esc)" : "Pantalla completa (las flechas ← → cambian de escena)";
      // El globo abierto quedaría descolocado al cambiar el tamaño del escenario
      closeCallout();
    };
    document.addEventListener("fullscreenchange", syncFs);
    document.addEventListener("webkitfullscreenchange", syncFs);

    /* Al llegar al juego se abre a pantalla completa. Si el navegador exige un
       gesto (lo habitual al llegar solo con scroll), se ofrece con un toque. */
    function showFsInvite() {
      if (panel.querySelector(".fs-invite")) return;
      const inv = document.createElement("div");
      inv.className = "fs-invite";
      inv.innerHTML = `<div class="fs-card">
          <p class="fs-t">⛶ La misión se juega a pantalla completa</p>
          <p class="fs-d">Así la captura de la herramienta se ve al doble de tamaño y sus textos se leen sin esfuerzo.
          Con <kbd>Esc</kbd> vuelves a esta página cuando quieras.</p>
          <div class="fs-actions">
            <button class="btn btn-primary" data-fs="go" type="button">Empezar a pantalla completa</button>
            <button class="btn" data-fs="no" type="button">Prefiero jugar aquí</button>
          </div>
        </div>`;
      $(".tour-body").appendChild(inv);
      inv.querySelector('[data-fs="go"]').addEventListener("click", async e => {
        e.stopPropagation();
        inv.remove();
        await enterFs();
      });
      inv.querySelector('[data-fs="no"]').addEventListener("click", e => {
        e.stopPropagation();
        inv.remove();
        fsOptOut = true;
        Store.set(FS_KEY, true);
      });
    }

    async function offerFullscreen() {
      if (fsOffered || fsOptOut || !fsSupported || isFs()) return;
      fsOffered = true;
      const ok = await enterFs();
      if (!ok) showFsInvite();
    }

    if (fsSupported && "IntersectionObserver" in window) {
      // Solo si te detienes en el juego: pasar de largo no secuestra la pantalla
      let dwell = null;
      const fsIO = new IntersectionObserver(entries => {
        for (const e of entries) {
          clearTimeout(dwell);
          if (e.isIntersecting) dwell = setTimeout(offerFullscreen, 800);
        }
      }, { threshold: 0.55 });
      fsIO.observe(panel);
    }

    /* ---------- Teclado: flechas para viajar, números para saltar ---------- */
    document.addEventListener("keydown", e => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = (e.target.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || e.target.isContentEditable) return;
      const inFs = (document.fullscreenElement || document.webkitFullscreenElement) === panel;
      if (!inFs) {
        const r = panel.getBoundingClientRect();
        if (r.bottom < 120 || r.top > innerHeight - 120) return; // el juego no está a la vista
      }
      if (e.key === "ArrowRight") { e.preventDefault(); go(cur + 1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); go(cur - 1); }
      else if (/^[1-8]$/.test(e.key)) { e.preventDefault(); go(parseInt(e.key, 10) - 1); }
      else if (e.key === "9" || e.key === "0") { e.preventDefault(); go(TOUR.length); }
    });

    /* El marcador arranca siempre a cero: no se restaura una partida anterior. */
    updateHUD();
    go(0);

    window.AppTour = {
      goTo: i => {
        go(i);
        fsOffered = true;
        if (!fsOptOut) enterFs();
        panel.scrollIntoView({ behavior: "smooth", block: "start" });
      },
      /** Entrada desde el menú: el clic es un gesto válido para pantalla completa. */
      open: () => {
        fsOffered = true;
        if (!fsOptOut) enterFs();
      },
    };
    $$(".tour-jump").forEach(b => b.addEventListener("click", () => window.AppTour.goTo(parseInt(b.dataset.scene, 10))));
  }

  /* ════════════════════════════════════════════════════════
     EPÍLOGO — la constelación que se convierte en pregunta
     ════════════════════════════════════════════════════════ */

  function initEpilogue() {
    const canvas = $("#epilogue-canvas");
    if (!canvas) return;
    const wrap = $("#epilogue");
    const glyphSpace = wrap.querySelector(".ep-glyph-space");
    const ctx = canvas.getContext("2d");
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let dpr = 1, W = 0, H = 0;
    let particles = [], links = [], bgStars = [], star = null;
    let formT0 = null, running = false, raf = 0, shock = 0;
    /* El punto del «?» es lo único clicable del epílogo y nada lo anuncia:
       late como un corazón y emite ondas hasta que alguien lo descubre. */
    const BEAT_MS = 1500;
    let discovered = false, hoverStar = false;

    /* Muestrea la silueta de un «?» dibujándolo en un lienzo oculto. */
    function sampleGlyph() {
      const off = document.createElement("canvas");
      off.width = 320; off.height = 480;
      const c = off.getContext("2d");
      c.font = "700 380px Fraunces, Georgia, serif";
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText("?", 160, 250);
      const img = c.getImageData(0, 0, 320, 480).data;
      const pts = [];
      for (let y = 0; y < 480; y += 9) {
        for (let x = 0; x < 320; x += 9) {
          if (img[(y * 320 + x) * 4 + 3] > 128) pts.push({ x, y });
        }
      }
      if (!pts.length) return { rest: [], dot: { x: 0.5, y: 0.95 } };
      let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
      for (const p of pts) {
        minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
      }
      const norm = pts.map(p => ({
        x: (p.x - minX) / (maxX - minX || 1),
        y: (p.y - minY) / (maxY - minY || 1),
      }));
      const dotPts = norm.filter(p => p.y > 0.86);
      const rest = norm.filter(p => p.y <= 0.86);
      const dot = dotPts.length
        ? {
            x: dotPts.reduce((s, p) => s + p.x, 0) / dotPts.length,
            y: dotPts.reduce((s, p) => s + p.y, 0) / dotPts.length,
          }
        : { x: 0.5, y: 0.95 };
      return { rest, dot };
    }

    function layout() {
      dpr = devicePixelRatio || 1;
      const r = wrap.getBoundingClientRect();
      canvas.width = r.width * dpr;
      canvas.height = r.height * dpr;
      W = canvas.width; H = canvas.height;
      const g = glyphSpace.getBoundingClientRect();
      const box = {
        x: (g.left - r.left) * dpr, y: (g.top - r.top) * dpr,
        w: g.width * dpr, h: g.height * dpr,
      };
      const { rest, dot } = sampleGlyph();
      let gh = box.h * 0.82;
      let gw = gh * 0.66;
      if (gw > box.w * 0.86) { gw = box.w * 0.86; gh = gw / 0.66; }
      const gx = box.x + box.w / 2 - gw / 2;
      const gy = box.y + box.h / 2 - gh / 2;
      const toCanvas = p => ({ x: gx + p.x * gw, y: gy + p.y * gh });

      particles = rest.map((p, i) => {
        const t = toCanvas(p);
        return {
          tx: t.x, ty: t.y,
          x: Math.random() * W, y: Math.random() * H,
          pc: i % 12,
          size: (1.7 + Math.random() * 1.6) * dpr,
          delay: Math.random() * 1.1,
          dur: 1.5 + Math.random() * 1.3,
          phase: Math.random() * Math.PI * 2,
        };
      });
      const d = toCanvas(dot);
      star = { x: d.x, y: d.y, burst: 0 };
      links = [];
      const maxDist = 30 * dpr;
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].tx - particles[j].tx;
          const dy = particles[i].ty - particles[j].ty;
          if (dx * dx + dy * dy < maxDist * maxDist && Math.random() < 0.4) links.push([i, j]);
        }
      }
      bgStars = Array.from({ length: 70 }, () => ({
        x: Math.random() * W, y: Math.random() * H,
        r: (0.5 + Math.random() * 1.1) * dpr,
        a: 0.06 + Math.random() * 0.16,
        tw: Math.random() * Math.PI * 2,
      }));
    }

    const easeOut = t => 1 - Math.pow(1 - t, 3);

    function draw(now) {
      ctx.clearRect(0, 0, W, H);
      const t = formT0 === null ? 0 : (now - formT0) / 1000;

      for (const s of bgStars) {
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(232,234,242,${s.a * (0.7 + 0.3 * Math.sin(now / 900 + s.tw))})`;
        ctx.fill();
      }

      let formed = 0;
      for (const p of particles) {
        const k = T.clamp((t - p.delay) / p.dur, 0, 1);
        const e = easeOut(k);
        formed += e;
        const wob = e >= 1 ? Math.sin(now / 700 + p.phase) * 1.6 * dpr : 0;
        const sh = shock > 0 ? Math.sin(p.phase) * shock * 9 * dpr : 0;
        p.cx = p.x + (p.tx - p.x) * e + wob + sh;
        p.cy = p.y + (p.ty - p.y) * e + wob * 0.7 + Math.cos(p.phase) * (shock * 9 * dpr);
      }
      formed = particles.length ? formed / particles.length : 0;

      if (formed > 0.55) {
        ctx.lineWidth = 1 * dpr;
        ctx.strokeStyle = `rgba(139,124,255,${(formed - 0.55) * 0.4})`;
        ctx.beginPath();
        for (const [i, j] of links) {
          ctx.moveTo(particles[i].cx, particles[i].cy);
          ctx.lineTo(particles[j].cx, particles[j].cy);
        }
        ctx.stroke();
      }

      for (const p of particles) {
        ctx.beginPath();
        ctx.arc(p.cx, p.cy, p.size, 0, Math.PI * 2);
        ctx.fillStyle = T.pitchColor(p.pc, 0.8);
        ctx.shadowColor = T.pitchColor(p.pc, 0.9);
        ctx.shadowBlur = 6 * dpr;
        ctx.fill();
      }
      ctx.shadowBlur = 0;

      if (star) {
        /* Latido «lub-dub»: dos pulsos seguidos y reposo. Un parpadeo senoidal
           parecía decoración; un latido parece algo vivo, y lo vivo se toca. */
        const cyc = (now % BEAT_MS) / BEAT_MS;
        const lub = Math.exp(-Math.pow((cyc - 0.05) / 0.05, 2));
        const dub = 0.6 * Math.exp(-Math.pow((cyc - 0.20) / 0.055, 2));
        const beat = reduced ? 0.4 : Math.min(1, lub + dub);
        /* Una vez descubierto, el faro se calma: ya ha hecho su trabajo. */
        const calm = discovered ? 0.4 : 1;
        const pulse = 0.72 + 0.28 * beat;

        /* Ondas concéntricas: el «toca aquí» sin escribir «toca aquí». */
        if (!discovered && !reduced) {
          ctx.lineWidth = 1.4 * dpr;
          for (const off of [0, 0.5]) {
            const ph = (cyc + off) % 1;
            ctx.beginPath();
            ctx.arc(star.x, star.y, (9 + ph * 42) * dpr, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(255,184,107,${0.42 * (1 - ph) * (1 - ph)})`;
            ctx.stroke();
          }
        }

        const R = (6.6 + beat * 3.6 * calm + (hoverStar ? 2 : 0) + star.burst * 10) * dpr;
        ctx.beginPath();
        ctx.arc(star.x, star.y, R, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,184,107,0.97)";
        ctx.shadowColor = "rgba(255,184,107,1)";
        ctx.shadowBlur = (26 + star.burst * 60) * pulse * dpr;
        ctx.fill();
        ctx.shadowBlur = 0;
        // destellos en cruz
        ctx.strokeStyle = `rgba(255,220,170,${0.5 * pulse + star.burst * 0.5})`;
        ctx.lineWidth = 1.2 * dpr;
        const L = (16 + beat * 6 * calm + star.burst * 26) * dpr;
        ctx.beginPath();
        ctx.moveTo(star.x - L, star.y); ctx.lineTo(star.x + L, star.y);
        ctx.moveTo(star.x, star.y - L); ctx.lineTo(star.x, star.y + L);
        ctx.stroke();
        star.burst = Math.max(0, star.burst - 0.02);
      }
      shock = Math.max(0, shock - 0.025);
    }

    function loop(now) {
      draw(now);
      if (running && !reduced) raf = requestAnimationFrame(loop);
    }

    const io = new IntersectionObserver(entries => {
      for (const e of entries) {
        if (e.isIntersecting) {
          if (formT0 === null) { layout(); formT0 = performance.now(); }
          running = true;
          cancelAnimationFrame(raf);
          if (reduced) {
            formT0 = performance.now() - 60000; // estado final directo
            draw(performance.now());
          } else {
            raf = requestAnimationFrame(loop);
          }
        } else {
          running = false;
          cancelAnimationFrame(raf);
        }
      }
    }, { threshold: 0.15 });
    io.observe(wrap);

    window.addEventListener("resize", () => {
      if (formT0 !== null) { layout(); formT0 = performance.now() - 60000; }
    });

    function nearStar(ev) {
      if (!star) return false;
      const r = canvas.getBoundingClientRect();
      const x = (ev.clientX - r.left) * dpr;
      const y = (ev.clientY - r.top) * dpr;
      const d = Math.hypot(x - star.x, y - star.y);
      return d < 60 * dpr;
    }

    canvas.addEventListener("mousemove", ev => {
      hoverStar = nearStar(ev);
      canvas.style.cursor = hoverStar ? "pointer" : "default";
    });
    canvas.addEventListener("mouseleave", () => { hoverStar = false; });

    canvas.addEventListener("click", ev => {
      if (!nearStar(ev)) return;
      discovered = true;
      star.burst = 1;
      shock = 1;
      AE.playSequence(AP.homeMelody(0, { resolve: true, beat: 0.34 }));
      if (reduced) draw(performance.now());
    });
  }

  /* ════════════════════════════════════════════════════════ */

  window.Chapters = {
    init() {
      initHero();
      initPlaylistDemo();
      initHomeMelody();
      initMoodDemo();
      initScaleBuilder();
      initCamelotWheel();
      initPipeline();
      initMatching();
      initLab();
      initAnatomy();
      initRelatives();
      initModulation();
      initFamous();
      initFourChords();
      initGame();
      initFlips();
      initQuiz();
      initTour();
      initEpilogue();
    },
  };
})();
