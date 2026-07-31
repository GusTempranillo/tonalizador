/* ============================================================
   Tonalizador · Tutorial interactivo
   main.js — Arranque: navegación, progreso, revelados, GSAP
   ============================================================ */
"use strict";

(() => {
  const $ = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));

  /* Capítulos ya leídos: se recuerdan entre visitas si el navegador lo permite */
  const SEEN_KEY = "tonalizador-tutorial:capitulos-v1";
  const Store = window.Store || { get: (k, f) => f, set: () => false };
  const seen = new Set(Store.get(SEEN_KEY, []) || []);

  function markSeen(id) {
    if (!id || seen.has(id)) return;
    seen.add(id);
    Store.set(SEEN_KEY, [...seen]);
    document.querySelector(`.sh-item[data-chapter-id="${id}"]`)?.classList.add("seen");
  }

  /* Un capítulo cuenta como leído si te detienes en él, no si pasas de largo */
  let dwellTimer = null, dwellId = null;
  function trackSeen(id) {
    if (id === dwellId) return;
    dwellId = id;
    clearTimeout(dwellTimer);
    if (!id || seen.has(id)) return;
    dwellTimer = setTimeout(() => markSeen(id), 2000);
  }

  /* ---------- Navegación por capítulos (puntos laterales) ---------- */

  function buildNav() {
    const nav = $("#chapter-nav");
    if (!nav) return [];
    const chapters = $$("[data-chapter]");
    chapters.forEach(ch => {
      const a = document.createElement("a");
      a.href = `#${ch.id}`;
      a.innerHTML = `<span class="tip">${ch.dataset.chapter}</span>`;
      a.setAttribute("aria-label", ch.dataset.chapter);
      nav.appendChild(a);
    });
    return chapters;
  }

  /* ---------- Glosario flotante ----------
     Marca la primera aparición de cada término en cada capítulo y muestra
     su definición al tocarlo, sin obligar a volver atrás en el viaje. */

  const GLOSARIO = [
    { id: "tonalidad", p: "tonalidades?", t: "Tonalidad",
      d: "La nota que actúa como «hogar» de una canción, junto con su estado de ánimo: Mayor (luminoso) o menor (melancólico). Por eso los resultados se leen «Do menor» o «Re Mayor»." },
    { id: "nota-hogar", p: "nota[-‑]hogar", t: "Nota-hogar (tónica)",
      d: "La nota alrededor de la cual se construye la canción y a la que la melodía tiende a volver. Los músicos la llaman tónica." },
    { id: "modo", p: "modo", t: "Modo (Mayor o menor)",
      d: "El «clima» de una tonalidad. La diferencia técnica es diminuta —dos notas de la escala bajan medio escalón— pero el efecto emocional es enorme." },
    { id: "escala", p: "escalas?", t: "Escala",
      d: "Las siete notas que una tonalidad trata como su familia, elegidas de las doce posibles siempre con la misma receta de distancias." },
    { id: "acorde", p: "acordes?", t: "Acorde",
      d: "Varias notas sonando a la vez. El más común es la tríada: tres notas alternas de la escala." },
    { id: "sensible", p: "sensible", t: "Sensible",
      d: "La nota situada justo debajo de la tónica. «Siente» la cercanía del hogar y genera una tensión que pide resolver." },
    { id: "camelot", p: "Camelot", t: "Código Camelot",
      d: "Código tipo reloj (1A–12B) que coloca las 24 tonalidades en una rueda. Dos canciones combinan si sus códigos son iguales o vecinos: mismo número con otra letra, o número contiguo con la misma letra." },
    { id: "mezcla", p: "mezcla armónica", t: "Mezcla armónica",
      d: "La técnica de encadenar canciones con códigos Camelot iguales o vecinos para que las transiciones no chirríen. Es el oficio de los DJ." },
    { id: "bpm", p: "BPM", t: "BPM",
      d: "Beats por minuto: los golpes de ritmo que da una canción en un minuto. Una balada ronda los 70; una canción de baile, 120–130." },
    { id: "relativa", p: "primas? hermanas?", t: "Relativas (primas hermanas)",
      d: "Cada tonalidad Mayor tiene una menor que usa exactamente las mismas siete notas —Do Mayor y La menor—. Solo cambia cuál manda, y por eso son el caso ambiguo por excelencia." },
    { id: "modular", p: "modul(?:ar|a|an)", t: "Modular",
      d: "Cambiar de tonalidad a mitad de una canción. Bohemian Rhapsody es el ejemplo clásico: el resultado indica entonces la tonalidad predominante." },
    { id: "csv", p: "CSV", t: "CSV",
      d: "Archivo de texto con una lista (título, artista, álbum…). Es el índice del libro, no los capítulos: no contiene música." },
    { id: "tunemymusic", p: "TuneMyMusic", t: "TuneMyMusic",
      d: "Servicio web gratuito que convierte playlists en archivos CSV y viceversa. Es el puente entre tu plataforma de música y Tonalizador." },
    { id: "reccobeats", p: "ReccoBeats", t: "ReccoBeats",
      d: "Base de datos musical gratuita que aporta la tonalidad y los BPM de una grabación ya identificada. Es un dato de catálogo, no un dictamen musicológico." },
    { id: "cache", p: "cach(?:é|e)", t: "Caché (memoria compartida)",
      d: "La memoria donde se guardan las respuestas ya averiguadas, con fecha de caducidad y número de versión, para no repetir trabajo. Si el método mejora, los resultados antiguos se recalculan." },
    { id: "isrc", p: "ISRC", t: "ISRC",
      d: "Código internacional que identifica una grabación concreta, no una canción: el estudio, el directo y el remix tienen cada uno el suyo." },
    { id: "cromatico", p: "perfil crom(?:á|a)tico", t: "Perfil cromático (HPCP)",
      d: "El peso acumulado de cada una de las doce notas a lo largo de una canción: la huella de doce barras que el análisis local compara con los 24 patrones tonales." },
    { id: "conf-tonal", p: "confianza tonal", t: "Confianza tonal",
      d: "Cuánta seguridad hay en la tonalidad misma. Si la fuente no la proporciona, Tonalizador muestra «sin dato» en lugar de inventar un porcentaje." },
    { id: "conf-id", p: "confianza de identificaci(?:ó|o)n", t: "Confianza de identificación",
      d: "Cuánta seguridad hay de haber encontrado la grabación correcta, y no una versión en directo, un remix o un cover." },
    { id: "remaster", p: "remasterizaci(?:ó|o)n", t: "Remasterización",
      d: "La misma grabación con el sonido pulido. No cambia la tonalidad, y por eso puede pasar el control automático mientras un directo o un cover van a revisión." },
  ];

  function buildTermRegex(p) {
    try {
      return new RegExp(`(^|[^\\p{L}])(${p})(?![\\p{L}])`, "iu");
    } catch (_) {
      return new RegExp(`(^|[^a-zA-ZáéíóúüñÁÉÍÓÚÜÑ])(${p})`, "i");
    }
  }

  function initGlossary() {
    const terms = GLOSARIO.map(t => ({ ...t, re: buildTermRegex(t.p) }));
    const OK = ".prose p, .analogy p, .ponder p, .step p, .step li, .app-card p, .flip-back p, .state-row p";
    const NO = "a, button, code, .mono, .gloss, h1, h2, h3, h4, h5, .kicker, .panel-title, .zip-tree, .tour-stage, .hero";

    document.querySelectorAll(".chapter").forEach(section => {
      const used = new Set();
      const walker = document.createTreeWalker(section, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          if (!node.nodeValue || node.nodeValue.length < 4) return NodeFilter.FILTER_REJECT;
          const parent = node.parentElement;
          if (!parent || parent.closest(NO) || !parent.closest(OK)) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      });
      const nodes = [];
      let n;
      while ((n = walker.nextNode())) nodes.push(n);

      for (const node of nodes) {
        for (const term of terms) {
          if (used.has(term.id)) continue;
          const m = term.re.exec(node.nodeValue);
          if (!m) continue;
          const start = m.index + m[1].length;
          const word = m[2];
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "gloss";
          btn.dataset.g = term.id;
          btn.textContent = word;
          btn.setAttribute("aria-label", `${word}: ver definición del glosario`);
          const frag = document.createDocumentFragment();
          frag.append(node.nodeValue.slice(0, start), btn, node.nodeValue.slice(start + word.length));
          node.parentNode.replaceChild(frag, node);
          used.add(term.id);
          break;
        }
      }
    });

    // Ventana flotante compartida
    const pop = document.createElement("div");
    pop.className = "gloss-pop";
    pop.hidden = true;
    pop.setAttribute("role", "tooltip");
    document.body.appendChild(pop);
    let current = null;

    function hide() {
      pop.hidden = true;
      current?.classList.remove("open");
      current = null;
    }

    function place() {
      if (!current) return;
      const r = current.getBoundingClientRect();
      // Si el término se sale de la pantalla, la ventana se retira
      if (r.bottom < 0 || r.top > innerHeight) { hide(); return; }
      const w = Math.min(330, innerWidth - 24);
      pop.style.width = `${w}px`;
      pop.style.left = `${Math.max(12, Math.min(r.left + r.width / 2 - w / 2, innerWidth - w - 12))}px`;
      const h = pop.offsetHeight;
      pop.style.top = r.bottom + 10 + h > innerHeight - 10
        ? `${Math.max(10, r.top - h - 10)}px`
        : `${r.bottom + 10}px`;
    }

    function show(btn) {
      const term = GLOSARIO.find(t => t.id === btn.dataset.g);
      if (!term) return;
      pop.innerHTML = `<strong>${term.t}</strong><p>${term.d}</p>`;
      pop.hidden = false;
      current?.classList.remove("open");
      current = btn;
      btn.classList.add("open");
      place();
    }

    document.addEventListener("click", e => {
      const btn = e.target.closest(".gloss");
      if (btn) {
        e.preventDefault();
        btn === current ? hide() : show(btn);
        return;
      }
      if (!e.target.closest(".gloss-pop")) hide();
    });
    document.addEventListener("keydown", e => { if (e.key === "Escape") hide(); });
    addEventListener("scroll", () => { if (current) place(); }, { passive: true });
    addEventListener("resize", hide);

  }

  /* ---------- Glosario completo, desplegable desde la cabecera ---------- */

  function initGlossaryMenu() {
    const btn = $("#gloss-btn"), panel = $("#gloss-panel");
    if (!btn || !panel) return;

    const clave = t => `${t.t} ${t.d}`.toLowerCase()
      .normalize("NFD").replace(/[̀-ͯ]/g, "");

    panel.innerHTML = `
      <div class="gm-head">
        <input type="search" id="gloss-filter" placeholder="Buscar un término…"
               aria-label="Buscar en el glosario" autocomplete="off">
      </div>
      <dl class="gm-list">
        ${GLOSARIO.map(t => `<div class="gm-item" data-k="${clave(t)}"><dt>${t.t}</dt><dd>${t.d}</dd></div>`).join("")}
      </dl>
      <p class="gm-empty" hidden>Ningún término coincide con esa búsqueda.</p>
      <p class="gm-foot">${GLOSARIO.length} términos · en el texto, las palabras subrayadas también se pueden tocar</p>`;

    const items = Array.from(panel.querySelectorAll(".gm-item"));
    const vacio = panel.querySelector(".gm-empty");
    const filtro = panel.querySelector("#gloss-filter");

    filtro.addEventListener("input", () => {
      const q = filtro.value.trim().toLowerCase()
        .normalize("NFD").replace(/[̀-ͯ]/g, "");
      let visibles = 0;
      items.forEach(it => {
        const ok = !q || it.dataset.k.includes(q);
        it.hidden = !ok;
        if (ok) visibles++;
      });
      vacio.hidden = visibles > 0;
    });

    wireDropdown(btn, panel, () => {
      filtro.value = "";
      filtro.dispatchEvent(new Event("input"));
      panel.scrollTop = 0;
      if (matchMedia("(hover: hover) and (pointer: fine)").matches) filtro.focus();
    });
  }

  /* ---------- Desplegables de la cabecera (capítulos y glosario) ---------- */

  const dropdowns = [];

  function wireDropdown(btn, panel, onOpen) {
    function open() {
      dropdowns.forEach(d => { if (d.panel !== panel) d.close(); });
      panel.hidden = false;
      btn.setAttribute("aria-expanded", "true");
      onOpen?.();
    }
    function close() {
      panel.hidden = true;
      btn.setAttribute("aria-expanded", "false");
    }
    btn.addEventListener("click", e => {
      e.stopPropagation();
      panel.hidden ? open() : close();
    });
    document.addEventListener("click", e => {
      if (!panel.hidden && !e.target.closest(".sh-menu-wrap")) close();
    });
    document.addEventListener("keydown", e => {
      if (e.key === "Escape" && !panel.hidden) { close(); btn.focus(); }
    });
    const api = { open, close, panel };
    dropdowns.push(api);
    return api;
  }

  /* ---------- Menú desplegable de capítulos (header) ---------- */

  function initMenu() {
    const btn = $("#menu-btn");
    const panel = $("#menu-panel");
    if (!btn || !panel) return;

    // El desplegable se conecta al final; los enlaces lo cierran al pulsarse
    const dd = wireDropdown(btn, panel, () => {
      panel.querySelector('[aria-current="true"]')?.scrollIntoView({ block: "nearest" });
    });
    const close = dd.close;

    // Construir la lista agrupada por actos, en orden de documento
    const nodes = Array.from(document.querySelectorAll(".divider-act, [data-chapter]"));
    let num = 0;
    for (const node of nodes) {
      if (node.classList.contains("divider-act")) {
        const label = node.querySelector(".act-label")?.textContent || "";
        const h2 = node.querySelector("h2")?.textContent || "";
        const g = document.createElement("a");
        g.className = "sh-group";
        g.href = `#${node.id}`;
        g.textContent = `${label} — ${h2}`;
        g.addEventListener("click", close);
        panel.appendChild(g);
      } else {
        const a = document.createElement("a");
        a.className = "sh-item" + (seen.has(node.id) ? " seen" : "");
        a.href = `#${node.id}`;
        a.dataset.chapterId = node.id;
        a.innerHTML = `<span class="n">${String(num).padStart(2, "0")}</span><span>${node.dataset.chapter}</span>`;
        a.addEventListener("click", close);
        panel.appendChild(a);
        num++;
        // Justo después del capítulo del manual, su joya: el juego
        if (node.id === "c-pasos") {
          const featured = document.createElement("a");
          featured.className = "sh-item sh-featured";
          featured.href = "#tour-panel";
          featured.innerHTML = `<span class="n">★</span><span><strong>Misión guiada</strong><br>
            <small>El juego: la app real, escena a escena</small></span>`;
          featured.addEventListener("click", () => {
            close();
            window.AppTour?.open?.(); // el clic autoriza la pantalla completa
          });
          panel.appendChild(featured);
        }
      }
    }
  }

  /* ---------- Barra de progreso + punto activo ---------- */

  function initProgress(chapters) {
    const bar = $("#progress-bar");
    const links = $$("#chapter-nav a");
    let ticking = false;
    function update() {
      ticking = false;
      const doc = document.documentElement;
      const p = doc.scrollTop / (doc.scrollHeight - doc.clientHeight || 1);
      if (bar) bar.style.width = `${p * 100}%`;
      let active = 0;
      chapters.forEach((ch, i) => {
        if (ch.getBoundingClientRect().top < innerHeight * 0.45) active = i;
      });
      links.forEach((l, i) => l.classList.toggle("active", i === active));
      const activeId = chapters[active]?.id;
      trackSeen(activeId);
      document.querySelectorAll(".sh-item").forEach(item => {
        if (item.dataset.chapterId === activeId) item.setAttribute("aria-current", "true");
        else item.removeAttribute("aria-current");
      });
    }
    addEventListener("scroll", () => {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
    update();
  }

  /* ---------- Revelado al hacer scroll ---------- */

  function initReveals() {
    if (!("IntersectionObserver" in window)) return; // sin soporte: todo visible
    document.documentElement.classList.add("io");
    const io = new IntersectionObserver(entries => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add("is-visible");
          io.unobserve(e.target);
        }
      }
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    $$(".reveal").forEach(el => io.observe(el));
  }

  /* ---------- Toques GSAP (solo si está disponible) ---------- */

  function initGsap() {
    if (!window.gsap) return;
    if (window.ScrollTrigger) gsap.registerPlugin(ScrollTrigger);
    gsap.from(".hero-inner > *", {
      y: 34, opacity: 0, duration: 1.1, stagger: 0.14, ease: "power3.out", delay: 0.15,
      onComplete() { document.querySelectorAll(".hero .reveal").forEach(el => el.classList.add("is-visible")); },
    });
    document.querySelectorAll(".hero .reveal").forEach(el => el.classList.add("is-visible"));
    if (window.ScrollTrigger) {
      $$(".divider-act").forEach(d => {
        gsap.from(d, {
          scrollTrigger: { trigger: d, start: "top 85%" },
          scale: 0.94, opacity: 0, duration: 0.9, ease: "power2.out",
        });
      });
    }
  }

  /* ---------- Primer gesto: desbloquear el audio ---------- */

  function initAudioUnlock() {
    // En captura, para que el motor de audio esté listo antes de que corra
    // el manejador del propio botón que ha provocado el gesto.
    const unlock = () => {
      const ctx = window.AudioEngine?.unlock();
      if (ctx && ctx.state === "running") {
        removeEventListener("pointerdown", unlock, true);
        removeEventListener("touchstart", unlock, true);
        removeEventListener("keydown", unlock, true);
      }
    };
    addEventListener("pointerdown", unlock, true);
    addEventListener("touchstart", unlock, true);
    addEventListener("keydown", unlock, true);
  }

  /* ---------- Arranque ---------- */

  document.addEventListener("DOMContentLoaded", () => {
    const chapters = buildNav();
    initGlossary();
    initMenu();
    initGlossaryMenu();
    initProgress(chapters);
    initReveals();
    initGsap();
    initAudioUnlock();
    window.Chapters?.init();
  });
})();
