/* ============================================================
   Tonalizador · Tutorial interactivo
   audio.js — Motor de sonido (WebAudio). Sintetiza un piano
   suave, acordes y progresiones. Todo se genera en el propio
   navegador: no se carga ni se envía ningún archivo de audio.
   ============================================================ */
"use strict";

window.AudioEngine = (() => {
  let ctx = null;
  let master = null;
  let analyser = null;
  let activeVoices = new Set();
  let scheduled = [];        // timeouts pendientes (para cancelar)
  let playToken = 0;         // invalida reproducciones anteriores
  let unlocked = false;      // ¿ha habido ya un gesto del usuario?

  /**
   * El navegador solo deja sonar tras un gesto del usuario. Hasta que ocurre,
   * NADA se programa: si se programase, el sonido quedaría en cola y estallaría
   * de golpe en el primer clic (una ráfaga de acordes de la nada).
   */
  function unlock() {
    unlocked = true;
    return ensureContext();
  }

  /** Empujón silencioso para que el dispositivo de audio arranque de verdad. */
  function primeDevice() {
    try {
      const src = ctx.createBufferSource();
      src.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      src.connect(ctx.destination);
      src.start(0);
    } catch (_) {
      // Algunos navegadores no lo necesitan
    }
  }

  /** Margen de programación: mayor si el reloj aún no ha arrancado. */
  function leadTime(c) {
    return c.state === "running" ? 0.012 : 0.09;
  }

  function ensureContext() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.9;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.knee.value = 24;
      comp.ratio.value = 6;
      analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      master.connect(comp);
      comp.connect(analyser);
      analyser.connect(ctx.destination);
      primeDevice();
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  const midiToFreq = m => 440 * Math.pow(2, (m - 69) / 12);

  /** Nota estilo piano eléctrico suave: 3 parciales + golpe de ataque. */
  function playNote(midi, { when = 0, duration = 0.9, velocity = 0.8, pan = 0 } = {}) {
    const c = ensureContext();
    if (!c || !unlocked) return;
    const t0 = c.currentTime + leadTime(c) + when;
    const freq = midiToFreq(midi);
    const gain = c.createGain();
    const panner = c.createStereoPanner ? c.createStereoPanner() : null;
    const out = panner || gain;
    if (panner) { panner.pan.value = pan; gain.connect(panner); }
    out.connect(master);

    const partials = [
      { mult: 1, type: "triangle", amp: 0.62 },
      { mult: 2, type: "sine", amp: 0.16 },
      { mult: 3, type: "sine", amp: 0.055 },
    ];
    const oscs = [];
    for (const p of partials) {
      const o = c.createOscillator();
      o.type = p.type;
      o.frequency.value = freq * p.mult;
      const g = c.createGain();
      g.gain.value = p.amp;
      o.connect(g);
      g.connect(gain);
      o.start(t0);
      o.stop(t0 + duration + 0.25);
      oscs.push(o);
    }
    const v = 0.22 * velocity;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(v, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(v * 0.55, t0 + 0.14);
    gain.gain.setTargetAtTime(0.0001, t0 + duration * 0.8, 0.12);

    const voice = { oscs, gain };
    activeVoices.add(voice);
    oscs[0].onended = () => activeVoices.delete(voice);
    return voice;
  }

  function playChord(midis, opts = {}) {
    const strum = opts.strum ?? 0.012;
    midis.forEach((m, i) => playNote(m, { ...opts, when: (opts.when || 0) + i * strum, pan: (i - midis.length / 2) * 0.12 }));
  }

  /**
   * Reproduce una secuencia de eventos {midis:[..], at:segundos, dur, vel}.
   * onStep(evento, índice) se llama en el momento (aprox.) de cada evento.
   * Devuelve una función cancel().
   */
  function playSequence(events, { tempoScale = 1, onStep = null, onEnd = null } = {}) {
    const c = ensureContext();
    if (!c) { onEnd && onEnd(); return () => {}; }
    stopAll();
    const token = ++playToken;
    let lastEnd = 0;
    events.forEach((ev, i) => {
      const at = ev.at * tempoScale;
      const dur = (ev.dur ?? 0.8) * tempoScale;
      lastEnd = Math.max(lastEnd, at + dur);
      if (unlocked && ev.midis && ev.midis.length) {
        playChord(ev.midis, { when: at, duration: dur, velocity: ev.vel ?? 0.8 });
      }
      if (onStep) {
        scheduled.push(setTimeout(() => { if (token === playToken) onStep(ev, i); }, at * 1000));
      }
    });
    if (onEnd) {
      scheduled.push(setTimeout(() => { if (token === playToken) onEnd(); }, (lastEnd + 0.15) * 1000));
    }
    return () => { if (token === playToken) stopAll(); };
  }

  /**
   * Pitido corto y seco para el «no» del juego: suena en el mismo instante
   * del clic (ataque de 4 ms) y se apaga en menos de un cuarto de segundo.
   * No pasa por el secuenciador, así que nada lo retrasa ni lo cancela.
   */
  function playBuzz({ from = 233, to = 98, duration = 0.19, volume = 0.34 } = {}) {
    const c = ensureContext();
    if (!c || !unlocked) return;
    const t0 = c.currentTime + leadTime(c);
    const osc = c.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(from, t0);
    osc.frequency.exponentialRampToValueAtTime(to, t0 + duration);

    const filter = c.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1600, t0);
    filter.frequency.exponentialRampToValueAtTime(520, t0 + duration);
    filter.Q.value = 1.2;

    const gain = c.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.03);
  }

  function stopAll() {
    playToken++;
    for (const id of scheduled) clearTimeout(id);
    scheduled = [];
    if (!ctx) return;
    const t = ctx.currentTime;
    for (const v of activeVoices) {
      try {
        v.gain.gain.cancelScheduledValues(t);
        v.gain.gain.setTargetAtTime(0.0001, t, 0.03);
        v.oscs.forEach(o => { try { o.stop(t + 0.12); } catch (_) {} });
      } catch (_) {}
    }
    activeVoices.clear();
  }

  /** Datos del analizador para dibujar la forma de onda real que suena. */
  function waveform(buffer) {
    if (!analyser) return null;
    analyser.getByteTimeDomainData(buffer);
    return buffer;
  }

  function analyserSize() { return analyser ? analyser.fftSize : 0; }

  const isReady = () => !!ctx;

  return { ensureContext, unlock, playNote, playChord, playSequence, playBuzz, stopAll, waveform, analyserSize, isReady, midiToFreq };
})();

/* ---------- Constructor de progresiones sobre theory.js ---------- */

window.AudioPhrases = (() => {
  const T = window.Theory;

  /** Progresión de acordes por grados, con conducción sencilla de voces. */
  function progressionEvents(tonicPc, mode, degrees, { beat = 0.62, octave = 3, withBass = true } = {}) {
    const events = [];
    degrees.forEach((deg, i) => {
      let triad = T.triadOnDegree(tonicPc, mode, deg, octave);
      // Conducción de voces: acercar cada acorde al anterior
      if (i > 0 && events[i - 1].triad) {
        const prev = events[i - 1].triad;
        triad = triad.map(n => {
          let best = n;
          for (const cand of [n - 12, n, n + 12]) {
            const dist = Math.min(...prev.map(p => Math.abs(p - cand)));
            const bestDist = Math.min(...prev.map(p => Math.abs(p - best)));
            if (dist < bestDist) best = cand;
          }
          return best;
        }).sort((a, b) => a - b);
      }
      const midis = withBass ? [triad[0] - 12, ...triad] : [...triad];
      events.push({ midis, at: i * beat, dur: beat * 1.55, vel: 0.8, triad, degree: deg });
    });
    return events;
  }

  /** Escala ascendente nota a nota. */
  function scaleEvents(tonicPc, mode, { beat = 0.34, octave = 4, addOctave = true } = {}) {
    const steps = (mode === 1 ? T.MAJOR_STEPS : T.MINOR_STEPS).slice();
    if (addOctave) steps.push(12);
    return steps.map((s, i) => ({
      midis: [12 * (octave + 1) + tonicPc + s],
      at: i * beat, dur: beat * 1.7, vel: 0.75, stepIndex: i,
      pc: (tonicPc + s) % 12,
    }));
  }

  /** Melodía corta que "vuelve a casa" (o se queda suspendida si resolve=false). */
  function homeMelody(tonicPc, { resolve = true, beat = 0.4, octave = 4 } = {}) {
    const base = 12 * (octave + 1) + tonicPc;
    const seq = [0, 4, 7, 12, 9, 5, 4, 2];
    const last = resolve ? 0 : 11; // tónica o sensible
    const notes = [...seq, last];
    return notes.map((s, i) => ({
      midis: [base + s], at: i * beat,
      dur: i === notes.length - 1 ? beat * 4 : beat * 1.5,
      vel: i === notes.length - 1 ? 0.9 : 0.72,
      pc: (tonicPc + s) % 12, isLast: i === notes.length - 1,
    }));
  }

  return { progressionEvents, scaleEvents, homeMelody };
})();
