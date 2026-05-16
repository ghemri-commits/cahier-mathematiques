import React, { useState, useEffect, useMemo, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';

// ============================================================
// STORAGE
// ============================================================
const SHARED = false;
const KEY_CONFIG = 'kumon:config';
const KEY_SESS_PREFIX = 'kumon:sess:';
const KEY_PROGRESS = 'kumon:progress';

const PROBLEMS_PER_PAGE = 10;
const PAGES_PER_BOOKLET = 10; // page 10 is the word-problem page on advanced levels
const BOOKLETS_PER_LEVEL = 20;

const DEFAULT_CONFIG = {
  kids: [
    { id: 'k1', name: 'Liam',   age: 7, color: 'teal',   inputMode: 'pencil', pin: '1111' },
    { id: 'k2', name: 'Camila', age: 9, color: 'coral',  inputMode: 'pencil', pin: '2222' },
    { id: 'k3', name: 'Invité', age: 8, color: 'indigo', inputMode: 'pencil', pin: '3333' },
  ],
  parentPin: '1234',
  parentEmail: '',
  deviceLockedToKid: null,
};

async function loadConfig() {
  try {
    const r = await window.storage.get(KEY_CONFIG, SHARED);
    if (r && r.value) {
      const parsed = JSON.parse(r.value);
      const kids = (parsed.kids || DEFAULT_CONFIG.kids).map((k, i) => {
        const defaults = DEFAULT_CONFIG.kids[i] || {};
        const merged = {
          ...defaults, ...k,
          inputMode: k.inputMode || 'pencil',
          pin: k.pin || defaults.pin || '0000',
        };
        // Migration: remove obsolete "enabled" flag (guest is always active now)
        delete merged.enabled;
        // Ensure name is set (especially for k3 / guest)
        if (!merged.name || !merged.name.trim()) {
          merged.name = defaults.name || (i === 2 ? 'Invité' : `Enfant ${i + 1}`);
        }
        return merged;
      });
      return { ...DEFAULT_CONFIG, ...parsed, kids };
    }
  } catch (e) {}
  return DEFAULT_CONFIG;
}
async function saveConfig(c) { try { await window.storage.set(KEY_CONFIG, JSON.stringify(c), SHARED); } catch (e) {} }
async function loadAllSessions() {
  try {
    const list = await window.storage.list(KEY_SESS_PREFIX, SHARED);
    if (!list || !list.keys) return [];
    const out = [];
    for (const k of list.keys) {
      try { const r = await window.storage.get(k, SHARED); if (r && r.value) out.push(JSON.parse(r.value)); }
      catch (e) {}
    }
    return out.sort((a, b) => b.timestamp - a.timestamp);
  } catch (e) { return []; }
}
async function saveSession(s) { try { await window.storage.set(KEY_SESS_PREFIX + s.id, JSON.stringify(s), SHARED); } catch (e) {} }
async function deleteSession(id) { try { await window.storage.delete(KEY_SESS_PREFIX + id, SHARED); } catch (e) {} }
async function loadProgress() {
  try {
    const r = await window.storage.get(KEY_PROGRESS, SHARED);
    if (r && r.value) return JSON.parse(r.value);
  } catch (e) {}
  return {};
}
async function saveProgress(p) { try { await window.storage.set(KEY_PROGRESS, JSON.stringify(p), SHARED); } catch (e) {} }

function getKidFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get('kid');
  } catch (e) { return null; }
}

// ============================================================
// CURRICULUM
// ============================================================
const LEVELS = [
  { id: '4A', cat: 'ADD', stage: 1,  name: 'Compter par bands',        desc: 'Suites : +2, +3, +5, +10, +20, +100', kind: 'count-by', op: '+', hasWordProblems: false },
  { id: '3A', cat: 'ADD', stage: 2,  name: 'Addition simple',          desc: 'Drill +1 à +9, paquets répétitifs',   kind: 'add-drill', op: '+', hasWordProblems: false },
  { id: '2A', cat: 'ADD', stage: 3,  name: 'Addition jusqu\u2019à 20', desc: 'Drill +1 à +9 (nombres plus grands)', kind: 'add-drill-20', op: '+', hasWordProblems: false },
  { id: 'A1', cat: 'ADD', stage: 4,  name: 'Addition à 2 chiffres',    desc: '2 chiffres + 1 ou 2 chiffres',         kind: 'add-2digit', op: '+', hasWordProblems: true },
  { id: 'A2', cat: 'ADD', stage: 5,  name: 'Addition à 3 chiffres',    desc: '3 chiffres avec retenue',              kind: 'add-3digit', op: '+', hasWordProblems: true },
  { id: 'S1', cat: 'SUB', stage: 6,  name: 'Soustraction simple',      desc: 'Drill −1 à −9, paquets répétitifs',    kind: 'sub-drill', op: '−', hasWordProblems: false },
  { id: 'S2', cat: 'SUB', stage: 7,  name: 'Soustraction jusqu\u2019à 20', desc: 'Drill −1 à −9 (plus grands)',     kind: 'sub-drill-20', op: '−', hasWordProblems: false },
  { id: 'S3', cat: 'SUB', stage: 8,  name: 'Soustraction à 2 chiffres', desc: '2 chiffres avec et sans emprunt',    kind: 'sub-2digit', op: '−', hasWordProblems: true },
  { id: 'S4', cat: 'SUB', stage: 9,  name: 'Soustraction à 3 chiffres', desc: '3 chiffres avec emprunt',             kind: 'sub-3digit', op: '−', hasWordProblems: true },
  { id: 'M1', cat: 'MUL', stage: 10, name: 'Tables ×2, ×5, ×10',       desc: 'Drill une table à la fois',            kind: 'mul-drill-easy', op: '×', hasWordProblems: true },
  { id: 'M2', cat: 'MUL', stage: 11, name: 'Tables ×3, ×4',            desc: 'Drill une table à la fois',            kind: 'mul-drill-mid', op: '×', hasWordProblems: true },
  { id: 'M3', cat: 'MUL', stage: 12, name: 'Tables ×6 à ×9',           desc: 'Drill une table à la fois',            kind: 'mul-drill-hard', op: '×', hasWordProblems: true },
  { id: 'M4', cat: 'MUL', stage: 13, name: 'Multiplication 2 chiffres', desc: '2 chiffres × 1 chiffre',              kind: 'mul-2x1', op: '×', hasWordProblems: true },
  { id: 'M5', cat: 'MUL', stage: 14, name: 'Multiplication 3 chiffres', desc: '3 chiffres × 1 chiffre',              kind: 'mul-3x1', op: '×', hasWordProblems: true },
];

const CAT_INFO = {
  ADD: { name: 'Addition',       accent: '#0c4a6e', soft: '#e0f2fe', dot: '#0369a1' },
  SUB: { name: 'Soustraction',   accent: '#064e3b', soft: '#d1fae5', dot: '#047857' },
  MUL: { name: 'Multiplication', accent: '#78350f', soft: '#fef3c7', dot: '#b45309' },
};

const KID_COLORS = {
  teal:   { ink: '#0f766e', soft: '#ccfbf1', strong: '#134e4a' },
  coral:  { ink: '#be123c', soft: '#ffe4e6', strong: '#881337' },
  amber:  { ink: '#b45309', soft: '#fef3c7', strong: '#78350f' },
  indigo: { ink: '#4338ca', soft: '#e0e7ff', strong: '#312e81' },
  emerald:{ ink: '#047857', soft: '#d1fae5', strong: '#064e3b' },
  rose:   { ink: '#be185d', soft: '#fce7f3', strong: '#831843' },
};

const INPUT_MODES = {
  keypad:  { label: 'Pavé numérique',     desc: 'Tape la réponse au doigt' },
  pencil:  { label: 'Crayon Apple (auto)', desc: 'Écris avec le crayon, l\u2019app corrige' },
  manual:  { label: 'Crayon manuel',       desc: 'Écris à la main, le parent corrige' },
};

// ============================================================
// SEEDED RNG
// ============================================================
function hashSeed(...args) {
  let h = 0;
  const s = args.join('-');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
function seededRandom(seed) {
  let s = seed % 233280 || 1;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}
const rndS = (rng, min, max) => Math.floor(rng() * (max - min + 1)) + min;
const pickS = (rng, a) => a[Math.floor(rng() * a.length)];
const shuffleS = (rng, arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// ============================================================
// DRILL PACKET MAPS
// ============================================================
const ADD_DRILL_MAP = (() => {
  const m = []; for (let n = 1; n <= 9; n++) { m.push(n, n); } m.push('mix', 'mix'); return m;
})();
const SUB_DRILL_MAP = (() => {
  const m = []; for (let n = 1; n <= 9; n++) { m.push(n, n); } m.push('mix', 'mix'); return m;
})();
const COUNT_BY_MAP = [2, 2, 3, 3, 5, 5, 5, 5, 10, 10, 10, 10, 20, 20, 20, 20, 100, 100, 100, 100];
const MUL_EASY_MAP = (() => {
  const tables = [2, 5, 10]; const m = [];
  tables.forEach(t => { for (let i = 0; i < 6; i++) m.push(t); });
  m.push('mix', 'mix'); return m;
})();
const MUL_MID_MAP = (() => {
  const m = []; for (let i = 0; i < 9; i++) m.push(3); for (let i = 0; i < 9; i++) m.push(4);
  m.push('mix', 'mix'); return m;
})();
const MUL_HARD_MAP = (() => {
  const tables = [6, 7, 8, 9]; const m = [];
  tables.forEach(t => { for (let i = 0; i < 4; i++) m.push(t); });
  m.push('mix', 'mix', 'mix', 'mix'); return m;
})();

function getDrillOperand(levelId, bookletNum) {
  const idx = bookletNum - 1;
  switch (levelId) {
    case '3A': case '2A': return ADD_DRILL_MAP[idx] ?? 'mix';
    case 'S1': case 'S2': return SUB_DRILL_MAP[idx] ?? 'mix';
    case '4A': return COUNT_BY_MAP[idx] ?? 2;
    case 'M1': return MUL_EASY_MAP[idx] ?? 'mix';
    case 'M2': return MUL_MID_MAP[idx] ?? 'mix';
    case 'M3': return MUL_HARD_MAP[idx] ?? 'mix';
    default: return null;
  }
}
function getBookletLabel(levelId, bookletNum) {
  const op = getDrillOperand(levelId, bookletNum);
  if (op === null) return null;
  if (op === 'mix') return 'Révision mélangée';
  switch (levelId) {
    case '4A': case '3A': case '2A': return `+${op}`;
    case 'S1': case 'S2': return `−${op}`;
    case 'M1': case 'M2': case 'M3': return `×${op}`;
    default: return null;
  }
}

// Operands already drilled in this level (from earlier booklets).
// Used to mix problems inside drill packets so the child can't autopilot.
function getLearnedOperands(levelId, bookletNum) {
  const learned = [];
  for (let b = 1; b < bookletNum; b++) {
    const op = getDrillOperand(levelId, b);
    if (op !== null && op !== 'mix' && !learned.includes(op)) {
      learned.push(op);
    }
  }
  return learned;
}

// Pick the operand for a single problem on a drill page.
// - "mix" booklets: pick uniformly from all learned operands
// - regular drill: ~65% the focus operand, ~35% from earlier learned operands
// - first packet of a level (no prior learning): always the focus
const FOCUS_RATIO = 0.65;
function pickDrillOperand(rng, levelId, bookletNum, allOperandsFallback) {
  const focus = getDrillOperand(levelId, bookletNum);
  const learned = getLearnedOperands(levelId, bookletNum);
  if (focus === 'mix') {
    const pool = learned.length > 0 ? learned : allOperandsFallback;
    return pickS(rng, pool);
  }
  if (learned.length === 0) return focus;
  return rng() < FOCUS_RATIO ? focus : pickS(rng, learned);
}

// ============================================================
// WORD PROBLEMS
// Templates per operation. Each produces a French statement and an answer.
// ============================================================
const WP_ADD = [
  (a, b) => ({ text: `Hier j'ai lu ${a} pages et aujourd'hui ${b} pages. Combien de pages au total ?`, answer: a + b }),
  (a, b) => ({ text: `J'ai ramassé ${a} fleurs et mon frère ${b}. Combien de fleurs avons-nous au total ?`, answer: a + b }),
  (a, b) => ({ text: `Dans la classe il y a ${a} filles et ${b} garçons. Combien d'élèves au total ?`, answer: a + b }),
  (a, b) => ({ text: `Le boulanger a vendu ${a} pains le matin et ${b} l'après-midi. Combien de pains au total ?`, answer: a + b }),
  (a, b) => ({ text: `Camila a ${a} autocollants. Elle en reçoit ${b} de plus. Combien en a-t-elle maintenant ?`, answer: a + b }),
  (a, b) => ({ text: `Dans un panier il y a ${a} pommes rouges et ${b} pommes vertes. Combien de pommes au total ?`, answer: a + b }),
  (a, b) => ({ text: `Liam a marché ${a} mètres puis ${b} mètres de plus. Quelle distance totale ?`, answer: a + b }),
  (a, b) => ({ text: `J'ai économisé ${a} \$ ce mois-ci et ${b} \$ le mois passé. Combien j'ai au total ?`, answer: a + b }),
];

const WP_SUB = [
  (a, b) => ({ text: `J'ai utilisé ${b} boutons d'une boîte de ${a}. Combien en reste-t-il ?`, answer: a - b }),
  (a, b) => ({ text: `Il y avait ${a} oiseaux sur l'arbre. ${b} se sont envolés. Combien restent-ils ?`, answer: a - b }),
  (a, b) => ({ text: `Le livre a ${a} pages. J'en ai lu ${b}. Combien de pages me reste-t-il ?`, answer: a - b }),
  (a, b) => ({ text: `Liam avait ${a} billes. Il en a perdu ${b}. Combien lui en reste-t-il ?`, answer: a - b }),
  (a, b) => ({ text: `Un magasin avait ${a} jouets en stock. Il en a vendu ${b}. Combien restent-ils ?`, answer: a - b }),
  (a, b) => ({ text: `Camila a ${a} bonbons. Elle en donne ${b} à ses amis. Combien lui en reste-t-il ?`, answer: a - b }),
  (a, b) => ({ text: `Dans une boîte de ${a} crayons, ${b} sont cassés. Combien sont en bon état ?`, answer: a - b }),
  (a, b) => ({ text: `Un autobus avait ${a} passagers. À l'arrêt, ${b} sont descendus. Combien restent-ils ?`, answer: a - b }),
];

const WP_MUL = [
  (a, b) => ({ text: `Il y a ${a} boîtes avec ${b} chocolats dans chaque. Combien de chocolats au total ?`, answer: a * b }),
  (a, b) => ({ text: `${a} enfants ont chacun ${b} ballons. Combien de ballons au total ?`, answer: a * b }),
  (a, b) => ({ text: `Chaque sac contient ${b} bonbons. Pour ${a} sacs, combien de bonbons en tout ?`, answer: a * b }),
  (a, b) => ({ text: `Dans la salle il y a ${a} rangées de ${b} chaises. Combien de chaises au total ?`, answer: a * b }),
  (a, b) => ({ text: `Liam achète ${a} paquets de cartes. Chaque paquet a ${b} cartes. Combien au total ?`, answer: a * b }),
  (a, b) => ({ text: `Une pizza a ${b} pointes. Pour ${a} pizzas, combien de pointes au total ?`, answer: a * b }),
  (a, b) => ({ text: `${a} araignées ont chacune ${b} pattes... Combien de pattes au total ?`, answer: a * b }),
];

function generateWordProblem(levelId, bookletNum) {
  const rng = seededRandom(hashSeed(levelId, bookletNum, 'word'));
  const lvl = LEVELS.find(l => l.id === levelId);
  if (!lvl) return null;

  // Pick range based on level
  let a, b, templates;
  switch (lvl.cat) {
    case 'ADD':
      if (lvl.id === 'A1') { a = rndS(rng, 11, 89); b = rndS(rng, 11, 99 - a); }
      else { a = rndS(rng, 100, 700); b = rndS(rng, 100, 999 - a); }
      templates = WP_ADD;
      break;
    case 'SUB':
      if (lvl.id === 'S3') { a = rndS(rng, 30, 99); b = rndS(rng, 5, a - 5); }
      else { a = rndS(rng, 200, 999); b = rndS(rng, 50, a - 50); }
      templates = WP_SUB;
      break;
    case 'MUL':
      if (lvl.id === 'M1') { a = pickS(rng, [2, 5, 10]); b = rndS(rng, 2, 10); }
      else if (lvl.id === 'M2') { a = pickS(rng, [3, 4]); b = rndS(rng, 2, 10); }
      else if (lvl.id === 'M3') { a = pickS(rng, [6, 7, 8, 9]); b = rndS(rng, 2, 10); }
      else if (lvl.id === 'M4') { a = rndS(rng, 11, 50); b = rndS(rng, 2, 9); }
      else { a = rndS(rng, 100, 500); b = rndS(rng, 2, 9); }
      templates = WP_MUL;
      break;
    default: return null;
  }
  const tpl = pickS(rng, templates);
  return tpl(a, b);
}

// ============================================================
// PROBLEM GENERATORS (regular pages)
// ============================================================
function generateProblemsForPage(levelId, bookletNum, pageNum) {
  const rng = seededRandom(hashSeed(levelId, bookletNum, pageNum));
  const lvl = LEVELS.find(l => l.id === levelId);
  if (!lvl) return [];
  const kind = lvl.kind;

  // ===== COUNT-BY (4A) =====
  if (kind === 'count-by') {
    const step = getDrillOperand('4A', bookletNum);
    const problems = [];
    const start = step * (pageNum - 1) + step;
    for (let i = 0; i < PROBLEMS_PER_PAGE; i++) {
      const a = start + i * step;
      problems.push({ a, b: step, op: '+', answer: a + step });
    }
    return shuffleS(rng, problems);
  }

  // ===== ADD DRILL ≤10 (3A) =====
  if (kind === 'add-drill') {
    const allOperands = [1,2,3,4,5,6,7,8,9];
    const problems = Array.from({ length: PROBLEMS_PER_PAGE }, () => {
      const n = pickDrillOperand(rng, levelId, bookletNum, allOperands);
      const a = rndS(rng, 1, 9);
      return { a, b: n, op: '+', answer: a + n };
    });
    return shuffleS(rng, problems);
  }

  // ===== ADD DRILL ≤20 (2A) =====
  if (kind === 'add-drill-20') {
    const allOperands = [1,2,3,4,5,6,7,8,9];
    const problems = Array.from({ length: PROBLEMS_PER_PAGE }, () => {
      const n = pickDrillOperand(rng, levelId, bookletNum, allOperands);
      // Use larger a values for this level (sum can go up to 20+)
      const maxA = Math.max(2, 20 - n);
      const a = rndS(rng, 2, maxA);
      return { a, b: n, op: '+', answer: a + n };
    });
    return shuffleS(rng, problems);
  }

  if (kind === 'add-2digit') {
    const advanced = bookletNum > 10;
    return Array.from({ length: PROBLEMS_PER_PAGE }, () => {
      if (advanced) { const a = rndS(rng, 10, 89); const b = rndS(rng, 10, 99 - a); return { a, b, op: '+', answer: a + b }; }
      const a = rndS(rng, 10, 89); const b = rndS(rng, 1, 9); return { a, b, op: '+', answer: a + b };
    });
  }

  if (kind === 'add-3digit') {
    return Array.from({ length: PROBLEMS_PER_PAGE }, () => {
      const a = rndS(rng, 100, 899); const b = rndS(rng, 100, 999 - a);
      return { a, b, op: '+', answer: a + b };
    });
  }

  // ===== SUB DRILL ≤10 (S1) =====
  if (kind === 'sub-drill') {
    const allOperands = [1,2,3,4,5,6,7,8,9];
    const problems = Array.from({ length: PROBLEMS_PER_PAGE }, () => {
      const n = pickDrillOperand(rng, levelId, bookletNum, allOperands);
      // a − n, with a in [n+1, 10] to keep answers positive and ≤10
      const a = rndS(rng, n + 1, 10);
      return { a, b: n, op: '−', answer: a - n };
    });
    return shuffleS(rng, problems);
  }

  // ===== SUB DRILL ≤20 (S2) =====
  if (kind === 'sub-drill-20') {
    const allOperands = [1,2,3,4,5,6,7,8,9];
    const problems = Array.from({ length: PROBLEMS_PER_PAGE }, () => {
      const n = pickDrillOperand(rng, levelId, bookletNum, allOperands);
      const a = rndS(rng, n + 1, 20);
      return { a, b: n, op: '−', answer: a - n };
    });
    return shuffleS(rng, problems);
  }

  if (kind === 'sub-2digit') {
    return Array.from({ length: PROBLEMS_PER_PAGE }, () => {
      const a = rndS(rng, 20, 99); const b = rndS(rng, 5, a - 1);
      return { a, b, op: '−', answer: a - b };
    });
  }
  if (kind === 'sub-3digit') {
    return Array.from({ length: PROBLEMS_PER_PAGE }, () => {
      const a = rndS(rng, 200, 999); const b = rndS(rng, 100, a - 1);
      return { a, b, op: '−', answer: a - b };
    });
  }

  // ===== MUL DRILL EASY (M1, tables ×2, ×5, ×10) =====
  if (kind === 'mul-drill-easy') {
    const allOperands = [2, 5, 10];
    const problems = Array.from({ length: PROBLEMS_PER_PAGE }, () => {
      const t = pickDrillOperand(rng, levelId, bookletNum, allOperands);
      const m = rndS(rng, 1, 10);
      return { a: t, b: m, op: '×', answer: t * m };
    });
    return shuffleS(rng, problems);
  }
  // ===== MUL DRILL MID (M2, tables ×3, ×4) =====
  if (kind === 'mul-drill-mid') {
    const allOperands = [3, 4];
    const problems = Array.from({ length: PROBLEMS_PER_PAGE }, () => {
      const t = pickDrillOperand(rng, levelId, bookletNum, allOperands);
      const m = rndS(rng, 1, 10);
      return { a: t, b: m, op: '×', answer: t * m };
    });
    return shuffleS(rng, problems);
  }
  // ===== MUL DRILL HARD (M3, tables ×6 à ×9) =====
  if (kind === 'mul-drill-hard') {
    const allOperands = [6, 7, 8, 9];
    const problems = Array.from({ length: PROBLEMS_PER_PAGE }, () => {
      const t = pickDrillOperand(rng, levelId, bookletNum, allOperands);
      const m = rndS(rng, 1, 10);
      return { a: t, b: m, op: '×', answer: t * m };
    });
    return shuffleS(rng, problems);
  }
  if (kind === 'mul-2x1') {
    return Array.from({ length: PROBLEMS_PER_PAGE }, () => {
      const a = rndS(rng, 11, 99); const b = rndS(rng, 2, 9);
      return { a, b, op: '×', answer: a * b };
    });
  }
  if (kind === 'mul-3x1') {
    return Array.from({ length: PROBLEMS_PER_PAGE }, () => {
      const a = rndS(rng, 101, 999); const b = rndS(rng, 2, 9);
      return { a, b, op: '×', answer: a * b };
    });
  }
  return [];
}

function pageRef(levelId, bookletNum, pageInBooklet) {
  const absolutePage = (bookletNum - 1) * PAGES_PER_BOOKLET + pageInBooklet;
  const sheetNum = Math.ceil(absolutePage / 2);
  const side = absolutePage % 2 === 1 ? 'a' : 'b';
  return `${levelId} ${sheetNum}${side}`;
}

// Word problem page is the LAST page in booklets that support it
function isWordProblemPage(levelId, pageInBooklet) {
  const lvl = LEVELS.find(l => l.id === levelId);
  if (!lvl?.hasWordProblems) return false;
  return pageInBooklet === PAGES_PER_BOOKLET;
}

// ============================================================
// PROGRESSION
// ============================================================
function getLevelStatus(kidId, levelId, progress, manualUnlocks) {
  const kidProg = progress[kidId] || {};
  const lvl = LEVELS.find(l => l.id === levelId);
  if (!lvl) return 'locked';
  const lp = kidProg[levelId] || { completedBooklets: [] };
  const isManualUnlocked = (manualUnlocks?.[kidId] || []).includes(levelId);
  if (lvl.stage === 1 || isManualUnlocked) {
    if (lp.completedBooklets.length >= BOOKLETS_PER_LEVEL) return 'completed';
    return 'active';
  }
  const prev = LEVELS.find(l => l.stage === lvl.stage - 1);
  const prevProg = (kidProg[prev.id] || { completedBooklets: [] }).completedBooklets;
  if (prevProg.length < BOOKLETS_PER_LEVEL) return 'locked';
  if (lp.completedBooklets.length >= BOOKLETS_PER_LEVEL) return 'completed';
  return 'active';
}
function getCurrentLevel(kidId, progress, manualUnlocks) {
  for (const lvl of LEVELS) {
    if (getLevelStatus(kidId, lvl.id, progress, manualUnlocks) === 'active') return lvl;
  }
  return null;
}
function getNextBooklet(kidId, levelId, progress) {
  const lp = (progress[kidId] || {})[levelId] || { completedBooklets: [] };
  for (let i = 1; i <= BOOKLETS_PER_LEVEL; i++) {
    if (!lp.completedBooklets.includes(i)) return i;
  }
  return BOOKLETS_PER_LEVEL;
}

// ============================================================
// FORMATTERS
// ============================================================
const fmtDate = ts => {
  const d = new Date(ts);
  return d.toLocaleDateString('fr-CA', { day: 'numeric', month: 'short', year: 'numeric' }) +
    ' · ' + d.toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' });
};
const fmtDur = sec => sec < 60 ? `${sec}s` : `${Math.floor(sec / 60)}m ${sec % 60}s`;
const fmtDurLong = sec => {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60); const s = sec % 60;
  if (m < 60) return `${m}m ${s.toString().padStart(2, '0')}s`;
  const h = Math.floor(m / 60); const mm = m % 60;
  return `${h}h ${mm.toString().padStart(2, '0')}m`;
};
const levelById = id => LEVELS.find(l => l.id === id);
const num2 = n => String(n).padStart(2, ' ');

function buildMailto(session, kid, email) {
  const lvl = levelById(session.levelId);
  const totalProblems = session.pages.reduce((a, p) => a + p.problems.length, 0);
  const totalCorrect = session.pages.reduce((a, p) => a + p.problems.filter(x => x.firstTryCorrect).length, 0);
  const scoreStr = session.needsReview
    ? 'À corriger'
    : `${totalCorrect}/${totalProblems} (${Math.round(totalCorrect / totalProblems * 100)}% au 1er essai)`;
  const subject = `Cahier — ${kid.name} — ${lvl.id} cahier ${session.bookletNum} (${scoreStr})`;
  const lines = [];
  lines.push(`Enfant : ${kid.name} (${kid.age} ans)`);
  lines.push(`Niveau : ${lvl.id} — ${lvl.name}`);
  const bookletLabel = getBookletLabel(lvl.id, session.bookletNum);
  lines.push(`Cahier nº ${session.bookletNum}${bookletLabel ? ' · ' + bookletLabel : ''}`);
  lines.push(`Date : ${fmtDate(session.timestamp)}`);
  const firstTry = session.firstTryDurationSec ?? session.durationSec ?? 0;
  const correction = session.correctionDurationSec ?? 0;
  lines.push(`Durée totale active : ${fmtDurLong(firstTry + correction)}`);
  lines.push(`  · 1er essai : ${fmtDurLong(firstTry)}`);
  if (correction > 0) lines.push(`  · Correction : ${fmtDurLong(correction)}`);
  if (session.pausedSec) lines.push(`  · Pauses : ${fmtDurLong(session.pausedSec)}`);
  lines.push(`Score : ${scoreStr}`);
  lines.push('');
  if (session.needsReview) {
    lines.push('⚠ Mode crayon manuel — ouvre l\'app pour voir les réponses manuscrites et les corriger.');
  } else {
    lines.push('Détail par feuille :');
    session.pages.forEach(pg => {
      const correct = pg.problems.filter(x => x.firstTryCorrect).length;
      lines.push('');
      lines.push(`— Feuille ${pg.ref.trim()} : ${correct}/${pg.problems.length}${pg.isWordPage ? ' (mot problème)' : ''}`);
      pg.problems.forEach((p, i) => {
        const idx = (pg.pageInBooklet - 1) * PROBLEMS_PER_PAGE + i + 1;
        const mark = p.firstTryCorrect ? '✓' : '✗';
        let expr;
        if (p.wordText) {
          expr = `${p.wordText} → ${p.firstTryAnswer ?? '—'}`;
        } else {
          expr = `${p.a} ${p.op} ${p.b} = ${p.firstTryAnswer ?? '—'}`;
        }
        const corr = p.firstTryCorrect ? '' : ` (bonne réponse : ${p.answer})`;
        lines.push(`  (${num2(idx)}) ${mark} ${expr}${corr}`);
      });
    });
  }
  const body = encodeURIComponent(lines.join('\n'));
  const to = email ? encodeURIComponent(email) : '';
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${body}`;
}

// ============================================================
// SHARED UI
// ============================================================
const Paper = ({ children }) => (
  <div className="min-h-screen w-full" style={{ background: 'var(--paper)' }}>{children}</div>
);

const Btn = ({ children, onClick, variant = 'primary', className = '', disabled }) => {
  const styles = {
    primary: 'bg-stone-900 text-stone-50 hover:bg-stone-800 active:bg-stone-950',
    soft: 'bg-stone-100 text-stone-900 border border-stone-300 hover:bg-stone-200',
  };
  return (
    <button onClick={onClick} disabled={disabled}
      className={`px-5 py-3 rounded-xl font-medium transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed ${styles[variant]} ${className}`}>
      {children}
    </button>
  );
};

function PinPad({ value, onChange, length = 4, accent = '#1c1917' }) {
  return (
    <div className="w-full max-w-xs mx-auto">
      <div className="flex gap-3 justify-center mb-6">
        {Array.from({ length }, (_, i) => (
          <div key={i} className="w-12 h-14 rounded-xl border-2 flex items-center justify-center font-display text-2xl"
            style={{ borderColor: value[i] ? accent : '#d6d3d1' }}>
            {value[i] ? '•' : ''}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {['1','2','3','4','5','6','7','8','9'].map(k => (
          <button key={k} onClick={() => onChange((value + k).slice(0, length))}
            className="h-14 rounded-xl font-display text-2xl bg-white border-2 border-stone-300 hover:bg-stone-50 active:scale-95 transition-all">{k}</button>
        ))}
        <div></div>
        <button onClick={() => onChange((value + '0').slice(0, length))}
          className="h-14 rounded-xl font-display text-2xl bg-white border-2 border-stone-300 hover:bg-stone-50 active:scale-95 transition-all">0</button>
        <button onClick={() => onChange(value.slice(0, -1))}
          className="h-14 rounded-xl text-lg bg-stone-100 hover:bg-stone-200 active:scale-95 transition-all">⌫</button>
      </div>
    </div>
  );
}

// ============================================================
// HANDWRITING CANVAS
// ============================================================
function HandwritingCanvas({ onChange, resetSignal, height = 60 }) {
  const canvasRef = useRef(null);
  const wrapperRef = useRef(null);
  const drawing = useRef(false);
  const pointerIdRef = useRef(null);
  const strokesRef = useRef([]);            // array of strokes, each = array of {x, y, w}
  const currentStrokeRef = useRef(null);
  const dprRef = useRef(1);
  const sizeRef = useRef({ w: 0, h: 0 });   // CSS size of canvas
  const [strokeCount, setStrokeCount] = useState(0);
  const rafRef = useRef(null);
  const pendingPointsRef = useRef([]);

  // Setup the canvas: size it to its CSS dimensions × DPR
  const setupCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return false;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    const dpr = window.devicePixelRatio || 1;
    // Only resize if dimensions changed (avoids wiping the drawing)
    const needsResize =
      canvas.width !== Math.round(rect.width * dpr) ||
      canvas.height !== Math.round(rect.height * dpr);
    if (needsResize) {
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
    }
    dprRef.current = dpr;
    sizeRef.current = { w: rect.width, h: rect.height };
    const ctx = canvas.getContext('2d');
    // Reset transform and apply DPR scale
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return true;
  };

  const drawGuides = (ctx, w, h) => {
    ctx.save();
    ctx.strokeStyle = '#e7e5e4';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(8, h * 0.78);
    ctx.lineTo(w - 8, h * 0.78);
    ctx.stroke();
    ctx.restore();
  };

  const fullRedraw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { w, h } = sizeRef.current;
    // Clear with transform reset
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    drawGuides(ctx, w, h);
    ctx.strokeStyle = '#1c1917';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const stroke of strokesRef.current) {
      if (stroke.length < 2) continue;
      for (let i = 1; i < stroke.length; i++) {
        ctx.beginPath();
        ctx.lineWidth = stroke[i].w;
        ctx.moveTo(stroke[i - 1].x, stroke[i - 1].y);
        ctx.lineTo(stroke[i].x, stroke[i].y);
        ctx.stroke();
      }
    }
  };

  // Incremental draw a single segment (used during active drawing)
  const drawSegment = (a, b, width) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.strokeStyle = '#1c1917';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  };

  const exportDataUrl = () => {
    const canvas = canvasRef.current;
    if (!canvas || strokesRef.current.length === 0) {
      onChange(null);
      return;
    }
    const ex = document.createElement('canvas');
    ex.width = 200;
    ex.height = 70;
    const exCtx = ex.getContext('2d');
    exCtx.fillStyle = '#faf6ee';
    exCtx.fillRect(0, 0, 200, 70);
    exCtx.drawImage(canvas, 0, 0, 200, 70);
    onChange(ex.toDataURL('image/jpeg', 0.6));
  };

  // Setup on mount and whenever canvas may have been resized
  useEffect(() => {
    setupCanvas();
    fullRedraw();
    // Re-setup on window resize / orientation change
    const onResize = () => {
      setupCanvas();
      fullRedraw();
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    // Use ResizeObserver for layout changes
    let ro = null;
    if (window.ResizeObserver && canvasRef.current) {
      ro = new ResizeObserver(onResize);
      ro.observe(canvasRef.current);
    }
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      if (ro) ro.disconnect();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line
  }, []);

  // Reset on resetSignal change
  useEffect(() => {
    strokesRef.current = [];
    currentStrokeRef.current = null;
    setStrokeCount(0);
    pendingPointsRef.current = [];
    drawing.current = false;
    setupCanvas();
    fullRedraw();
    onChange(null);
    // eslint-disable-next-line
  }, [resetSignal]);

  // Get point in CSS coords (NOT scaled by DPR — ctx is already scaled)
  const getPoint = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  // Get stroke width based on pointer type and pressure
  const getWidth = (e) => {
    if (e.pointerType === 'pen') {
      const p = (typeof e.pressure === 'number' && e.pressure > 0) ? e.pressure : 0.5;
      return 1.5 + p * 3.5;  // 1.5 to 5 px
    }
    // touch or mouse
    return 2.5;
  };

  // Schedule a draw of pending points (smooth animation)
  const flushPending = () => {
    rafRef.current = null;
    const pts = pendingPointsRef.current;
    pendingPointsRef.current = [];
    const stroke = currentStrokeRef.current;
    if (!stroke || pts.length === 0) return;
    for (const pt of pts) {
      const prev = stroke[stroke.length - 1];
      stroke.push(pt);
      if (prev) drawSegment(prev, pt, pt.w);
    }
  };

  const start = (e) => {
    // Prevent the browser from scrolling / triggering scribble
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Ensure canvas is correctly sized (in case it was hidden then shown)
    setupCanvas();
    // Capture pointer so we keep receiving events even if finger leaves canvas
    try {
      canvas.setPointerCapture(e.pointerId);
      pointerIdRef.current = e.pointerId;
    } catch (err) {}
    drawing.current = true;
    const pt = getPoint(e);
    const w = getWidth(e);
    currentStrokeRef.current = [{ ...pt, w }];
    // Draw a tiny dot so a single tap leaves a mark
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#1c1917';
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, w / 2, 0, Math.PI * 2);
    ctx.fill();
  };

  const move = (e) => {
    if (!drawing.current) return;
    if (pointerIdRef.current !== null && e.pointerId !== pointerIdRef.current) return;
    e.preventDefault();
    const pt = getPoint(e);
    const w = getWidth(e);
    pendingPointsRef.current.push({ ...pt, w });
    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(flushPending);
    }
  };

  const end = (e) => {
    if (!drawing.current) return;
    drawing.current = false;
    // Flush remaining points immediately
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      flushPending();
    }
    if (canvasRef.current && pointerIdRef.current !== null) {
      try { canvasRef.current.releasePointerCapture(pointerIdRef.current); } catch (err) {}
      pointerIdRef.current = null;
    }
    if (currentStrokeRef.current && currentStrokeRef.current.length >= 1) {
      strokesRef.current.push(currentStrokeRef.current);
      setStrokeCount(strokesRef.current.length);
      exportDataUrl();
    }
    currentStrokeRef.current = null;
  };

  const undoLast = () => {
    if (strokesRef.current.length === 0) return;
    strokesRef.current.pop();
    setStrokeCount(strokesRef.current.length);
    setupCanvas();
    fullRedraw();
    exportDataUrl();
  };

  const clearAll = () => {
    strokesRef.current = [];
    setStrokeCount(0);
    setupCanvas();
    fullRedraw();
    onChange(null);
  };

  const hasInk = strokeCount > 0;

  return (
    <div className="select-none" ref={wrapperRef} style={{ touchAction: 'none' }}>
      <div className="rounded-lg border-2 border-stone-300 bg-white overflow-hidden relative"
        style={{ borderColor: hasInk ? '#a8a29e' : '#d6d3d1', touchAction: 'none' }}>
        <canvas ref={canvasRef}
          className="block w-full"
          style={{
            height: `${height}px`,
            touchAction: 'none',
            // Critical for iOS Safari to allow Apple Pencil input
            WebkitUserSelect: 'none',
            userSelect: 'none',
            WebkitTouchCallout: 'none',
            display: 'block',
          }}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
          onPointerLeave={end}
        />
        {!hasInk && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-stone-300 text-[11px] uppercase tracking-widest">✎ écris ici</div>
          </div>
        )}
      </div>
      {hasInk && (
        <div className="mt-1.5 flex gap-1.5 justify-end">
          <button onClick={undoLast}
            className="text-[10px] uppercase tracking-widest text-stone-600 hover:text-stone-900 bg-stone-100 hover:bg-stone-200 px-2 py-1 rounded-md transition-all active:scale-95">
            ↶ Annuler
          </button>
          <button onClick={clearAll}
            className="text-[10px] uppercase tracking-widest text-rose-700 hover:text-rose-900 bg-rose-50 hover:bg-rose-100 px-2 py-1 rounded-md transition-all active:scale-95">
            ✕ Effacer tout
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================================
// KUMON WORKSHEET PAGE
// ============================================================
function KumonWorksheetPage({ pageRef: ref, problems, startIndex, values, drawings, onValueChange, onDrawingChange, onFocus, focusedIdx, mode, accent }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm p-6 sm:p-10 max-w-2xl mx-auto" style={{ minHeight: 500 }}>
      <div className="font-kumon text-xl sm:text-2xl text-stone-900 tracking-wide tabular-nums">
        {ref.trim()}
      </div>
      <div className="mt-8 sm:mt-12 space-y-4 sm:space-y-5">
        {problems.map((p, i) => {
          const globalNum = startIndex + i + 1;
          const isFocused = focusedIdx === i;
          // Use column layout for 2+ digit operands (like Kumon classic format)
          const useColumn = (p.a >= 10 || p.b >= 10) && (p.op === '+' || p.op === '−' || p.op === '×' || p.op === '÷');
          if (useColumn) {
            const expectedAnswer =
              p.op === '+' ? p.a + p.b :
              p.op === '−' ? p.a - p.b :
              p.op === '×' ? p.a * p.b :
              p.op === '÷' ? Math.floor(p.a / p.b) :
              0;
            return (
              <div key={i} className="flex items-start gap-2 sm:gap-4">
                <div className="font-kumon text-stone-400 text-xs sm:text-sm tabular-nums w-7 sm:w-9 text-right shrink-0 pt-3">
                  ({globalNum})
                </div>
                <div className="flex-1 flex justify-start" onClick={() => onFocus(i)}>
                  <ColumnProblem
                    a={p.a} b={p.b} op={p.op}
                    answer={expectedAnswer}
                    currentInput={values[i] || ''}
                    inputMode={mode}
                    accent={accent}
                    onInkChange={(pos, url) => onDrawingChange(i, url)}
                    showCarries={true}
                    feedback={null}
                    resetSignal={`${ref}-${i}`}
                  />
                </div>
              </div>
            );
          }
          // Original horizontal layout for 1-digit operands
          return (
            <div key={i} className="flex items-center gap-2 sm:gap-4">
              <div className="font-kumon text-stone-400 text-xs sm:text-sm tabular-nums w-7 sm:w-9 text-right shrink-0">
                ({globalNum})
              </div>
              <div className="font-kumon text-xl sm:text-3xl text-stone-900 tabular-nums flex items-center gap-2 sm:gap-3 flex-1">
                <span className="text-right">{p.a}</span>
                <span className="text-stone-700">{p.op}</span>
                <span className="text-right">{p.b}</span>
                <span>=</span>
                {mode === 'manual' ? (
                  <div className="flex-1 max-w-[180px]">
                    <HandwritingCanvas onChange={(d) => onDrawingChange(i, d)}
                      resetSignal={`${ref}-${i}`} height={60} />
                  </div>
                ) : (
                  <input
                    type="text" inputMode="numeric" pattern="[0-9]*"
                    value={values[i] || ''}
                    onChange={e => onValueChange(i, e.target.value.replace(/\D/g, '').slice(0, 5))}
                    onFocus={() => onFocus(i)}
                    placeholder={isFocused ? '?' : ''}
                    className="font-kumon text-xl sm:text-3xl bg-transparent outline-none border-0 tabular-nums text-stone-900 w-20 sm:w-28"
                    style={{
                      borderBottom: `2px solid ${isFocused ? accent : '#d6d3d1'}`,
                      color: '#1c1917',
                    }} />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// WORD PROBLEM PAGE (single problem with statement)
// ============================================================
function WordProblemPage({ pageRef: ref, wordProblem, value, drawing, onValueChange, onDrawingChange, onFocus, isFocused, mode, accent }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm p-6 sm:p-10 max-w-2xl mx-auto" style={{ minHeight: 500 }}>
      <div className="flex items-center justify-between">
        <div className="font-kumon text-xl sm:text-2xl text-stone-900 tracking-wide tabular-nums">
          {ref.trim()}
        </div>
        <div className="text-[10px] uppercase tracking-widest text-stone-500 px-2 py-1 rounded-full bg-amber-50 text-amber-800">
          Mot problème
        </div>
      </div>
      <div className="mt-12 sm:mt-16 max-w-md mx-auto">
        <div className="font-kumon text-lg sm:text-2xl text-stone-900 leading-relaxed text-center">
          {wordProblem.text}
        </div>
        <div className="mt-10 flex items-center justify-center gap-3">
          <div className="font-kumon text-2xl sm:text-3xl text-stone-700">Réponse :</div>
          {mode === 'manual' ? (
            <div className="w-48">
              <HandwritingCanvas onChange={onDrawingChange}
                resetSignal={`word-${ref}`} height={70} />
            </div>
          ) : (
            <input
              type="text" inputMode="numeric" pattern="[0-9]*"
              value={value || ''}
              onChange={e => onValueChange(e.target.value.replace(/\D/g, '').slice(0, 5))}
              onFocus={onFocus}
              placeholder={isFocused ? '?' : ''}
              autoFocus
              className="font-kumon text-2xl sm:text-4xl bg-transparent outline-none border-0 tabular-nums text-stone-900 w-32 text-center"
              style={{ borderBottom: `3px solid ${accent}`, color: '#1c1917' }} />
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// COLUMN PROBLEM (Kumon-style vertical math layout)
// ============================================================

// Helper : Calcule les retenues pour une addition
// Retourne un tableau de retenues par position (de droite à gauche)
// Ex: 47 + 38 → unités: 7+8=15 → retenue 1 → tens: 4+3+1=8 → pas de retenue
// Returns [1, 0] (carries above tens column, then hundreds — none)
// ───────────────────────────────────────────────────────────────
function computeAddCarries(a, b) {
  const digitsA = String(a).split('').reverse().map(Number);
  const digitsB = String(b).split('').reverse().map(Number);
  const maxLen = Math.max(digitsA.length, digitsB.length);
  const carries = [];
  let carry = 0;
  for (let i = 0; i < maxLen; i++) {
    const da = digitsA[i] || 0;
    const db = digitsB[i] || 0;
    const sum = da + db + carry;
    carry = Math.floor(sum / 10);
    carries.push(carry);
  }
  // carries[i] = retenue produite par la colonne i, à afficher au-dessus de la colonne i+1
  return carries;
}

// Helper : Calcule les emprunts pour une soustraction
// Retourne pour chaque chiffre du minuende, sa nouvelle valeur après emprunts (ou null si inchangé)
// Ex: 52 − 27 → unités: 2 < 7, on emprunte → 12 et le 5 devient 4
//   Returns { borrowed: [12, 4], canceled: [null, 5] }
// canceled[i] = nombre barré (ancien chiffre) à la position i
// borrowed[i] = nouveau chiffre à afficher (au-dessus, en plus petit)
function computeSubBorrows(a, b) {
  const digitsA = String(a).split('').reverse().map(Number);
  const digitsB = String(b).split('').reverse().map(Number);
  const newDigits = [...digitsA];  // we'll mutate
  const canceled = digitsA.map(() => null);
  const borrowed = digitsA.map(() => null);
  for (let i = 0; i < newDigits.length; i++) {
    const db = digitsB[i] || 0;
    if (newDigits[i] < db) {
      // Need to borrow from next column
      let j = i + 1;
      while (j < newDigits.length && newDigits[j] === 0) {
        canceled[j] = newDigits[j];
        borrowed[j] = 9;
        newDigits[j] = 9;
        j++;
      }
      if (j < newDigits.length) {
        canceled[j] = newDigits[j];
        borrowed[j] = newDigits[j] - 1;
        newDigits[j] -= 1;
      }
      canceled[i] = newDigits[i];
      borrowed[i] = newDigits[i] + 10;
      newDigits[i] += 10;
    }
  }
  return { canceled, borrowed };
}

// ───────────────────────────────────────────────────────────────
// MAIN COMPONENT : <ColumnProblem>
// ───────────────────────────────────────────────────────────────
// Props:
//   a, b           — numbers (a is the top, b is the bottom)
//   op             — '+', '−', '×', '÷'
//   answer         — expected answer (for validation)
//   currentInput   — string of digits typed so far (right-to-left)
//   inputMode      — 'keypad' | 'pencil' | 'manual'
//   accent         — color
//   onInkChange    — for pencil mode, callback with dataURL per case
//   showCarries    — boolean, whether to display carries (parent setting)
//   feedback       — 'correct' | 'wrong' | null (display feedback)
//   resetSignal    — increments to reset pencil canvases
// ───────────────────────────────────────────────────────────────
function ColumnProblem({
  a, b, op, answer, currentInput = '',
  inputMode = 'keypad',
  accent = '#1c1917',
  onInkChange,
  showCarries = true,
  feedback = null,
  resetSignal = 0,
}) {
  // Determine number of digits for display
  const aStr = String(a);
  const bStr = String(b);
  const answerStr = String(answer);
  // Width = max digits needed (could be answer length, which is usually >= aStr/bStr length)
  const width = Math.max(aStr.length, bStr.length, answerStr.length);

  // Pad each with leading spaces to align right
  const aPadded = aStr.padStart(width, ' ');
  const bPadded = bStr.padStart(width, ' ');

  // Carries / borrows (only computed for visual aid)
  const carries = useMemo(() => {
    if (!showCarries) return [];
    if (op === '+') return computeAddCarries(a, b);
    return [];
  }, [a, b, op, showCarries]);

  const borrows = useMemo(() => {
    if (!showCarries) return { canceled: [], borrowed: [] };
    if (op === '−') return computeSubBorrows(a, b);
    return { canceled: [], borrowed: [] };
  }, [a, b, op, showCarries]);

  // For displaying typed answer: right-align the digits in `currentInput`
  // Each case at position `i` (from right) shows currentInput[currentInput.length - 1 - i] if exists
  const inputDigits = String(currentInput || '').split('');
  // Determine how many cases (digits) the answer slot has
  const answerLen = answerStr.length;
  // For each position from right (0..answerLen-1), what digit?
  const getDigitAtPos = (posFromRight) => {
    const idx = inputDigits.length - 1 - posFromRight;
    return idx >= 0 ? inputDigits[idx] : null;
  };

  // Calculate which carry to show: carry produced by column i goes ABOVE column i+1
  // carries[i] = digit (0 or 1 typically)
  const getCarryAtPos = (posFromRight) => {
    // Carry shown above column posFromRight = carry produced by column (posFromRight - 1)
    if (posFromRight === 0) return 0;  // no carry above units
    return carries[posFromRight - 1] || 0;
  };

  // How many digits has the user typed?
  const typedCount = inputDigits.length;

  // Sizes
  const cellSize = inputMode === 'pencil' ? 56 : 44;
  const digitSize = inputMode === 'pencil' ? 'text-3xl' : 'text-3xl';
  const gap = 4;

  // Generate column index array (rightmost = 0)
  const colIndices = Array.from({ length: width }, (_, i) => width - 1 - i);
  const answerColIndices = Array.from({ length: answerLen }, (_, i) => answerLen - 1 - i);

  // Spacing for op sign and answer indent
  const totalWidth = width * cellSize + (width - 1) * gap;
  const opSignWidth = 24;
  const containerWidth = opSignWidth + 8 + totalWidth;

  return (
    <div className="select-none inline-block">
      <div className="relative font-display tabular-nums"
        style={{ width: containerWidth, minWidth: 'min-content' }}>

        {/* ROW 1 : Carries (or borrows) ─ small digits above */}
        {showCarries && (op === '+' || op === '−') && (
          <div className="flex justify-end items-end" style={{ height: 20, marginBottom: 2, gap }}>
            <div style={{ width: opSignWidth + 8 }} />
            {colIndices.map((posFromRight) => {
              if (op === '+') {
                const carry = getCarryAtPos(posFromRight);
                // Only show carry if user has typed past the column that produces it
                const colThatProduces = posFromRight - 1;
                const shouldShow = carry > 0 && typedCount > colThatProduces + 1;
                return (
                  <div key={posFromRight}
                    className="flex items-center justify-center text-sm font-bold"
                    style={{
                      width: cellSize,
                      color: shouldShow ? accent : 'transparent',
                      transition: 'color 0.2s',
                      transform: shouldShow ? 'scale(1)' : 'scale(0.5)',
                      transitionProperty: 'color, transform',
                    }}>
                    {shouldShow ? carry : '·'}
                  </div>
                );
              } else if (op === '−') {
                // Show the new (borrowed) digit if it was modified
                const newDigit = borrows.borrowed[posFromRight];
                const shouldShow = newDigit !== null && newDigit !== undefined;
                return (
                  <div key={posFromRight}
                    className="flex items-center justify-center text-sm font-bold"
                    style={{
                      width: cellSize,
                      color: shouldShow ? accent : 'transparent',
                    }}>
                    {shouldShow ? newDigit : '·'}
                  </div>
                );
              }
              return <div key={posFromRight} style={{ width: cellSize }} />;
            })}
          </div>
        )}

        {/* ROW 2 : Top number (a) */}
        <div className="flex justify-end items-center" style={{ gap, marginBottom: 2 }}>
          <div style={{ width: opSignWidth + 8 }} />
          {colIndices.map((posFromRight) => {
            const charIdx = width - 1 - posFromRight;
            const digit = aPadded[charIdx];
            const isDigit = digit !== ' ';
            const isCanceled = op === '−' && borrows.canceled[posFromRight] !== null;
            return (
              <div key={posFromRight}
                className={`flex items-center justify-center ${digitSize} relative`}
                style={{ width: cellSize, height: cellSize, color: '#1c1917' }}>
                <span style={{
                  textDecoration: isCanceled && showCarries ? 'line-through' : 'none',
                  textDecorationColor: accent,
                  opacity: isCanceled && showCarries ? 0.55 : 1,
                }}>
                  {isDigit ? digit : ''}
                </span>
              </div>
            );
          })}
        </div>

        {/* ROW 3 : Op sign + Bottom number (b) */}
        <div className="flex justify-end items-center" style={{ gap, marginBottom: 2 }}>
          <div className={`text-3xl font-bold flex items-center justify-end`}
            style={{ width: opSignWidth + 8, color: '#1c1917', paddingRight: 6 }}>
            {op}
          </div>
          {colIndices.map((posFromRight) => {
            const charIdx = width - 1 - posFromRight;
            const digit = bPadded[charIdx];
            const isDigit = digit !== ' ';
            return (
              <div key={posFromRight}
                className={`flex items-center justify-center ${digitSize}`}
                style={{ width: cellSize, height: cellSize, color: '#1c1917' }}>
                {isDigit ? digit : ''}
              </div>
            );
          })}
        </div>

        {/* ROW 4 : Horizontal line */}
        <div className="flex justify-end items-center" style={{ gap }}>
          <div style={{ width: opSignWidth + 8 }} />
          <div className="h-0.5 rounded-full" style={{
            width: width * cellSize + (width - 1) * gap,
            background: '#1c1917',
          }} />
        </div>

        {/* ROW 5 : Answer cells */}
        <div className="flex justify-end items-center" style={{ gap, marginTop: 8 }}>
          <div style={{ width: opSignWidth + 8 }} />
          {/* Spacer cells if answer is shorter than width */}
          {Array.from({ length: width - answerLen }, (_, i) => (
            <div key={`spacer-${i}`} style={{ width: cellSize, height: cellSize }} />
          ))}
          {answerColIndices.map((posFromRight) => {
            const digit = getDigitAtPos(posFromRight);
            const hasDigit = digit !== null;
            const isCorrectFeedback = feedback === 'correct';
            const isWrongFeedback = feedback === 'wrong';
            const isNextSlot = !hasDigit && posFromRight === answerLen - 1 - typedCount;

            if (inputMode === 'pencil') {
              // For pencil mode, each cell is a HandwritingCanvas
              return (
                <div key={posFromRight}
                  className="rounded-lg border-2 overflow-hidden"
                  style={{
                    width: cellSize, height: cellSize,
                    borderColor: isCorrectFeedback ? '#10b981' :
                                 isWrongFeedback ? '#dc2626' :
                                 hasDigit ? accent : '#d6d3d1',
                    background: 'white',
                  }}>
                  <ColumnPencilCell
                    cellId={`${a}-${b}-${op}-pos${posFromRight}`}
                    onChange={(dataUrl) => onInkChange && onInkChange(posFromRight, dataUrl)}
                    resetSignal={resetSignal}
                    size={cellSize}
                  />
                </div>
              );
            }

            return (
              <div key={posFromRight}
                className={`rounded-lg border-2 flex items-center justify-center ${digitSize} font-bold transition-all`}
                style={{
                  width: cellSize, height: cellSize,
                  borderColor: isCorrectFeedback ? '#10b981' :
                               isWrongFeedback ? '#dc2626' :
                               hasDigit ? accent :
                               isNextSlot ? accent + '80' : '#d6d3d1',
                  background: hasDigit ? (isCorrectFeedback ? '#d1fae5' : isWrongFeedback ? '#fee2e2' : 'white') : 'white',
                  color: isCorrectFeedback ? '#065f46' :
                         isWrongFeedback ? '#991b1b' :
                         hasDigit ? accent : '#a8a29e',
                  boxShadow: isNextSlot && !hasDigit ? `0 0 0 3px ${accent}25` : 'none',
                  transform: hasDigit ? 'scale(1)' : isNextSlot ? 'scale(1.02)' : 'scale(1)',
                  animation: hasDigit ? 'cellPop 0.18s ease-out' : 'none',
                }}>
                {digit || (isNextSlot ? '·' : '')}
              </div>
            );
          })}
        </div>

        {/* Animation keyframes - injected once globally would be better but inline is OK */}
        <style>{`
          @keyframes cellPop {
            0% { transform: scale(0.7); }
            70% { transform: scale(1.12); }
            100% { transform: scale(1); }
          }
        `}</style>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────
// Sub-component : Small pencil cell for pencil mode
// (reuses HandwritingCanvas logic but smaller)
// ───────────────────────────────────────────────────────────────
function ColumnPencilCell({ cellId, onChange, resetSignal, size }) {
  // Just a smaller version of HandwritingCanvas, no labels
  return (
    <div style={{ width: size, height: size, touchAction: 'none' }}>
      <HandwritingCanvas
        onChange={onChange}
        resetSignal={resetSignal}
        height={size}
      />
    </div>
  );
}

// ============================================================
// NUMBER PAD
// ============================================================
function NumPad({ onDigit, onClear, onNext }) {
  const keys = [['1','2','3'],['4','5','6'],['7','8','9']];
  const btn = "h-12 sm:h-14 rounded-xl text-2xl font-kumon bg-white border-2 border-stone-300 hover:bg-stone-50 active:bg-stone-100 active:scale-95 transition-all shadow-sm";
  return (
    <div className="grid grid-cols-3 gap-2 max-w-xs mx-auto select-none">
      {keys.flat().map(k => <button key={k} onClick={() => onDigit(k)} className={btn}>{k}</button>)}
      <button onClick={onClear} className={btn + " text-lg text-stone-600"}>⌫</button>
      <button onClick={() => onDigit('0')} className={btn}>0</button>
      <button onClick={onNext}
        className="h-12 sm:h-14 rounded-xl text-sm font-medium bg-stone-900 text-white hover:bg-stone-800 active:scale-95 transition-all shadow-sm">↓</button>
    </div>
  );
}

// ============================================================
// PAUSE OVERLAY
// ============================================================
function PauseOverlay({ onResume }) {
  return (
    <div className="fixed inset-0 bg-stone-900/85 backdrop-blur-md z-50 flex items-center justify-center">
      <div className="text-center px-6">
        <div className="text-7xl mb-4">⏸</div>
        <div className="font-display text-4xl text-white mb-2">Pause</div>
        <div className="text-stone-300 text-sm mb-8">Le timer est arrêté</div>
        <button onClick={onResume}
          className="px-10 py-4 rounded-2xl bg-white text-stone-900 font-medium text-lg hover:bg-stone-100 active:scale-95 transition-all">
          ▶ Reprendre
        </button>
      </div>
    </div>
  );
}

// ============================================================
// SCREEN: KID PICKER
// ============================================================
function KidPicker({ config, sessions, progress, manualUnlocks, onPickKid, onPickParent, lockedKidId }) {
  const today = new Date();
  const todayStr = today.toLocaleDateString('fr-CA', { weekday: 'long', day: 'numeric', month: 'long' });
  const pendingReview = sessions.filter(s => s.needsReview).length;
  const visibleKids = config.kids.filter(k => {
    // Guest is always active now (enabled flag removed). Only hide if no name.
    if (!k.name || k.name.trim() === '') return false;
    if (lockedKidId && k.id !== lockedKidId) return false;
    return true;
  });

  return (
    <Paper>
      <div className="max-w-5xl mx-auto px-6 sm:px-8 pt-12 pb-8">
        <div className="flex items-baseline justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.3em] text-stone-500">Cahier de mathématiques</div>
            <h1 className="font-display text-4xl sm:text-5xl text-stone-900 mt-2 leading-none">Pratique quotidienne</h1>
          </div>
          <div className="text-xs text-stone-500 capitalize hidden sm:block">{todayStr}</div>
        </div>
        <div className="mt-3 flex items-center gap-2 text-xs text-stone-500">
          <span className="inline-block w-12 h-px bg-stone-400"></span>
          <span className="uppercase tracking-widest">Méthode inspirée de Kumon</span>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 sm:px-8 pb-16">
        <div className="text-xs uppercase tracking-widest text-stone-500 mb-5">
          {lockedKidId ? 'Profil de cet appareil' : 'Qui pratique aujourd\'hui ?'}
        </div>
        <div className={`grid gap-5 ${visibleKids.length === 1 ? 'grid-cols-1 max-w-xl mx-auto' : 'grid-cols-1 md:grid-cols-2'}`}>
          {visibleKids.map(kid => {
            const c = KID_COLORS[kid.color] || KID_COLORS.teal;
            const kSessions = sessions.filter(s => s.kidId === kid.id);
            const todayCount = kSessions.filter(s => {
              const d = new Date(s.timestamp);
              return d.toDateString() === today.toDateString();
            }).length;
            const currentLevel = getCurrentLevel(kid.id, progress, manualUnlocks);
            const completedLevels = LEVELS.filter(l => getLevelStatus(kid.id, l.id, progress, manualUnlocks) === 'completed').length;
            return (
              <button key={kid.id} onClick={() => onPickKid(kid)}
                className="group relative text-left rounded-3xl p-6 sm:p-7 border-2 transition-all hover:-translate-y-1 hover:shadow-2xl active:scale-[0.98]"
                style={{ background: c.soft, borderColor: c.ink }}>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-5">
                    <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl flex items-center justify-center font-display text-4xl sm:text-5xl text-white leading-none"
                      style={{ background: c.ink }}>
                      {kid.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="font-display text-2xl sm:text-3xl text-stone-900 leading-tight">{kid.name}</div>
                      <div className="text-xs sm:text-sm text-stone-600 mt-1">{kid.age} ans · {INPUT_MODES[kid.inputMode]?.label}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] uppercase tracking-widest text-stone-500">Aujourd'hui</div>
                    <div className="font-display text-2xl sm:text-3xl mt-1" style={{ color: c.strong }}>{todayCount}</div>
                  </div>
                </div>
                <div className="mt-6 pt-5 border-t flex items-center justify-between text-sm" style={{ borderColor: c.ink + '33' }}>
                  <div className="text-stone-600">
                    {currentLevel ? (
                      <>Niveau : <span className="font-medium text-stone-800">{currentLevel.id}</span></>
                    ) : (
                      <span className="text-emerald-700 font-medium">🎓 Programme complet !</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 font-medium" style={{ color: c.strong }}>
                    <span>Continuer</span>
                    <span className="transition-transform group-hover:translate-x-1">→</span>
                  </div>
                </div>
                <div className="mt-2 text-[10px] text-stone-500 uppercase tracking-widest">
                  {completedLevels}/{LEVELS.length} niveaux complétés
                </div>
              </button>
            );
          })}
        </div>

        {visibleKids.length === 0 && (
          <div className="rounded-2xl border-2 border-dashed border-stone-300 p-12 text-center">
            <div className="text-stone-700 mb-2">Aucun enfant configuré</div>
            <div className="text-xs text-stone-500">Va dans Accès parent pour ajouter un enfant</div>
          </div>
        )}

        <div className="mt-16 flex items-center justify-center gap-3">
          <button onClick={onPickParent}
            className="text-xs uppercase tracking-[0.25em] text-stone-500 hover:text-stone-900 transition-colors py-2 px-4 rounded-lg hover:bg-stone-100 relative">
            🔒 Accès parent
            {pendingReview > 0 && (
              <span className="absolute -top-1 -right-1 bg-rose-600 text-white text-[10px] rounded-full w-5 h-5 flex items-center justify-center font-bold">{pendingReview}</span>
            )}
          </button>
        </div>
      </div>
    </Paper>
  );
}

// ============================================================
// SCREEN: KID PIN GATE
// ============================================================
function KidPinGate({ kid, onSuccess, onBack }) {
  const [entered, setEntered] = useState('');
  const [error, setError] = useState(false);
  const c = KID_COLORS[kid.color] || KID_COLORS.teal;

  useEffect(() => {
    if (entered.length === 4) {
      if (entered === kid.pin) onSuccess();
      else { setError(true); setTimeout(() => { setEntered(''); setError(false); }, 600); }
    }
  }, [entered, kid.pin, onSuccess]);

  return (
    <Paper>
      <div className="max-w-md mx-auto px-6 pt-10 pb-16 min-h-screen flex flex-col">
        <button onClick={onBack} className="text-sm text-stone-500 hover:text-stone-900 self-start">← Retour</button>
        <div className="flex-1 flex flex-col items-center justify-center">
          <div className="w-20 h-20 rounded-2xl flex items-center justify-center font-display text-5xl text-white mb-4"
            style={{ background: c.ink }}>{kid.name.charAt(0).toUpperCase()}</div>
          <div className="font-display text-3xl text-stone-900">Bonjour {kid.name} !</div>
          <div className="text-sm text-stone-500 mt-2">Entre ton code à 4 chiffres</div>
          <div className={`mt-6 ${error ? 'animate-shake' : ''}`}>
            <PinPad value={entered} onChange={setEntered} accent={c.ink} />
          </div>
          {error && <div className="text-xs text-rose-700 mt-3">Code incorrect</div>}
        </div>
      </div>
    </Paper>
  );
}

// ============================================================
// SCREEN: LEVEL PATH
// ============================================================
function LevelPath({ kid, progress, manualUnlocks, sessions, onPickBooklet, onBack }) {
  const c = KID_COLORS[kid.color] || KID_COLORS.teal;
  const [openLevel, setOpenLevel] = useState(() => {
    const cur = getCurrentLevel(kid.id, progress, manualUnlocks);
    return cur?.id || null;
  });
  const grouped = LEVELS.reduce((acc, l) => { (acc[l.cat] ||= []).push(l); return acc; }, {});

  // For showing time per completed booklet
  const sessionByBooklet = useMemo(() => {
    const m = {};
    sessions.filter(s => s.kidId === kid.id).forEach(s => {
      const key = `${s.levelId}-${s.bookletNum}`;
      if (!m[key] || s.timestamp > m[key].timestamp) m[key] = s;
    });
    return m;
  }, [sessions, kid.id]);

  return (
    <Paper>
      <div className="max-w-4xl mx-auto px-6 sm:px-8 pt-10 pb-6">
        <button onClick={onBack} className="text-sm text-stone-600 hover:text-stone-900 mb-6 flex items-center gap-1">
          <span>←</span> <span>Accueil</span>
        </button>
        <div className="flex items-center gap-5">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center font-display text-4xl text-white"
            style={{ background: c.ink }}>{kid.name.charAt(0).toUpperCase()}</div>
          <div>
            <div className="text-xs uppercase tracking-widest text-stone-500">Programme</div>
            <h1 className="font-display text-3xl text-stone-900">{kid.name}</h1>
            <div className="text-xs text-stone-500 mt-0.5">{INPUT_MODES[kid.inputMode]?.label}</div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 sm:px-8 pb-16 space-y-8">
        {Object.entries(grouped).map(([cat, levels]) => {
          const info = CAT_INFO[cat];
          return (
            <div key={cat}>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-2 h-2 rounded-full" style={{ background: info.dot }}></div>
                <div className="font-display text-lg text-stone-900">{info.name}</div>
                <div className="flex-1 h-px bg-stone-300"></div>
              </div>
              <div className="space-y-2">
                {levels.map(lvl => {
                  const status = getLevelStatus(kid.id, lvl.id, progress, manualUnlocks);
                  const lp = (progress[kid.id] || {})[lvl.id] || { completedBooklets: [] };
                  const completed = lp.completedBooklets.length;
                  const isOpen = openLevel === lvl.id;
                  const locked = status === 'locked';
                  const done = status === 'completed';
                  const nextBooklet = getNextBooklet(kid.id, lvl.id, progress);
                  const manuallyUnlocked = (manualUnlocks[kid.id] || []).includes(lvl.id);
                  return (
                    <div key={lvl.id} className="bg-white rounded-2xl border-2 overflow-hidden"
                      style={{
                        borderColor: done ? '#047857' :
                                     status === 'active' ? info.dot + '80' :
                                     '#e7e5e4',
                        opacity: locked ? 0.55 : 1,
                      }}>
                      <button
                        onClick={() => !locked && setOpenLevel(isOpen ? null : lvl.id)}
                        disabled={locked}
                        className="w-full p-4 flex items-center justify-between hover:bg-stone-50 transition-colors text-left disabled:cursor-not-allowed">
                        <div className="flex items-center gap-3">
                          <div className="font-kumon text-xl text-stone-900 tabular-nums w-12 text-center">
                            {locked ? '🔒' : done ? '✓' : lvl.id}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <div className="font-medium text-stone-900">{lvl.name}</div>
                              {manuallyUnlocked && !locked && (
                                <div className="text-[10px] uppercase tracking-widest px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800">Débloqué parent</div>
                              )}
                            </div>
                            <div className="text-xs text-stone-600 mt-0.5">{lvl.desc}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          {locked ? (
                            <div className="text-xs text-stone-500">Verrouillé</div>
                          ) : (
                            <>
                              <div className="text-xs font-mono text-stone-500 tabular-nums">{completed}/{BOOKLETS_PER_LEVEL}</div>
                              <div className="text-stone-400 text-xs">{isOpen ? '▲' : '▼'}</div>
                            </>
                          )}
                        </div>
                      </button>
                      {isOpen && !locked && (
                        <div className="px-4 pb-4 border-t border-stone-200 pt-4">
                          {!done && (
                            <button onClick={() => onPickBooklet(lvl, nextBooklet)}
                              className="w-full mb-3 px-4 py-3 rounded-xl font-medium text-white transition-all active:scale-95 hover:opacity-90 flex items-center justify-center gap-2"
                              style={{ background: c.ink }}>
                              <span>▶ Continuer · Cahier {nextBooklet}</span>
                              {getBookletLabel(lvl.id, nextBooklet) && (
                                <span className="font-kumon text-base opacity-80">({getBookletLabel(lvl.id, nextBooklet)})</span>
                              )}
                            </button>
                          )}
                          <div className="grid grid-cols-5 sm:grid-cols-10 gap-2">
                            {Array.from({ length: BOOKLETS_PER_LEVEL }, (_, i) => i + 1).map(bookletNum => {
                              const bDone = lp.completedBooklets.includes(bookletNum);
                              const isNext = bookletNum === nextBooklet && !done;
                              const label = getBookletLabel(lvl.id, bookletNum);
                              return (
                                <button key={bookletNum}
                                  onClick={() => onPickBooklet(lvl, bookletNum)}
                                  className={`aspect-square rounded-lg font-kumon text-sm tabular-nums transition-all active:scale-95 flex flex-col items-center justify-center ${
                                    bDone
                                      ? 'bg-emerald-100 text-emerald-800 border-2 border-emerald-300 hover:bg-emerald-200'
                                      : isNext
                                      ? 'text-white border-2 hover:opacity-90'
                                      : 'bg-stone-100 text-stone-700 border-2 border-stone-200 hover:bg-stone-200'
                                  }`}
                                  style={isNext ? { background: c.ink, borderColor: c.ink } : {}}>
                                  <span>{bookletNum}</span>
                                  {label && <span className="text-[9px] opacity-80 leading-none mt-0.5">{label}</span>}
                                  {bDone && <span className="text-[8px] leading-none mt-0.5">✓</span>}
                                </button>
                              );
                            })}
                          </div>
                          <div className="mt-3 text-[10px] uppercase tracking-widest text-stone-500">
                            Chaque cahier = 10 feuilles × 10 problèmes{lvl.hasWordProblems ? ' + 1 mot problème' : ''}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </Paper>
  );
}

// ============================================================
// SCREEN: BOOKLET — all 10 pages first, THEN check everything
// ============================================================
function Booklet({ kid, level, bookletNum, onComplete, onAbort }) {
  const c = KID_COLORS[kid.color] || KID_COLORS.teal;
  const info = CAT_INFO[level.cat];
  const mode = kid.inputMode || 'keypad';
  const bookletLabel = getBookletLabel(level.id, bookletNum);
  const hasWordPage = level.hasWordProblems;

  // pageData[pageIdx] = { values: {0: '5', ...}, drawings: {...}, wordValue: '...', wordDrawing: '...' }
  const [pageIdx, setPageIdx] = useState(0);
  const [pageData, setPageData] = useState({}); // Holds answers for each page
  const [focusedIdx, setFocusedIdx] = useState(0);

  // Phase: 'doing' (filling all pages) | 'reviewing' (showing results) | 'correcting' (per-page redo)
  const [phase, setPhase] = useState('doing');
  // After review: track which problems were correct on first try
  const [pageResults, setPageResults] = useState([]); // per page: { problems: [{...firstTryCorrect, firstTryAnswer}], score }
  const [correctingPageIdx, setCorrectingPageIdx] = useState(0); // when correcting
  const [correctingValues, setCorrectingValues] = useState({});
  const [correctingDrawings, setCorrectingDrawings] = useState({});
  const [correctingWordValue, setCorrectingWordValue] = useState('');
  const [correctingWordDrawing, setCorrectingWordDrawing] = useState(null);

  // Timer with pause — split by phase
  const [firstTryDurationSec, setFirstTryDurationSec] = useState(0);
  const [correctionDurationSec, setCorrectionDurationSec] = useState(0);
  const [pausedSec, setPausedSec] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const tickerRef = useRef(null);

  // Convenience: total active time so far
  const activeSec = firstTryDurationSec + correctionDurationSec;

  useEffect(() => {
    tickerRef.current = setInterval(() => {
      if (isPaused) setPausedSec(s => s + 1);
      else if (phase === 'doing') setFirstTryDurationSec(s => s + 1);
      else if (phase === 'correcting') setCorrectionDurationSec(s => s + 1);
      // 'reviewing' phase: brief screen, not counted
    }, 1000);
    return () => clearInterval(tickerRef.current);
  }, [isPaused, phase]);

  const pageInBooklet = pageIdx + 1;
  const isWordPage = hasWordProblems(level.id) && pageInBooklet === PAGES_PER_BOOKLET;
  const ref = pageRef(level.id, bookletNum, pageInBooklet);

  const problems = useMemo(() => {
    if (isWordPage) return [];
    return generateProblemsForPage(level.id, bookletNum, pageInBooklet);
  }, [level.id, bookletNum, pageInBooklet, isWordPage]);

  const wordProblem = useMemo(() => {
    if (!isWordPage) return null;
    return generateWordProblem(level.id, bookletNum);
  }, [level.id, bookletNum, isWordPage]);

  const startIndex = pageIdx * PROBLEMS_PER_PAGE;
  const currentPageData = pageData[pageIdx] || { values: {}, drawings: {}, wordValue: '', wordDrawing: null };

  const setCurrentPageField = (field, key, val) => {
    setPageData(prev => {
      const cur = prev[pageIdx] || { values: {}, drawings: {}, wordValue: '', wordDrawing: null };
      if (field === 'values') return { ...prev, [pageIdx]: { ...cur, values: { ...cur.values, [key]: val } } };
      if (field === 'drawings') return { ...prev, [pageIdx]: { ...cur, drawings: { ...cur.drawings, [key]: val } } };
      if (field === 'wordValue') return { ...prev, [pageIdx]: { ...cur, wordValue: val } };
      if (field === 'wordDrawing') return { ...prev, [pageIdx]: { ...cur, wordDrawing: val } };
      return prev;
    });
  };

  const onValueChange = (i, v) => setCurrentPageField('values', i, v);
  const onDrawingChange = (i, d) => setCurrentPageField('drawings', i, d);
  const onWordValueChange = (v) => setCurrentPageField('wordValue', null, v);
  const onWordDrawingChange = (d) => setCurrentPageField('wordDrawing', null, d);

  const keypadDigit = (d) => {
    if (isWordPage) {
      setCurrentPageField('wordValue', null, (currentPageData.wordValue + d).slice(0, 5));
      return;
    }
    const cur = currentPageData.values[focusedIdx] || '';
    setCurrentPageField('values', focusedIdx, (cur + d).slice(0, 5));
  };
  const keypadClear = () => {
    if (isWordPage) {
      setCurrentPageField('wordValue', null, currentPageData.wordValue.slice(0, -1));
      return;
    }
    const cur = currentPageData.values[focusedIdx] || '';
    setCurrentPageField('values', focusedIdx, cur.slice(0, -1));
  };
  const keypadNext = () => {
    if (isWordPage) return;
    for (let i = focusedIdx + 1; i < problems.length; i++) { setFocusedIdx(i); return; }
    setFocusedIdx(0);
  };

  // Check if current page is fully filled
  const isCurrentPageFilled = () => {
    if (isWordPage) {
      return mode === 'manual' ? !!currentPageData.wordDrawing : !!currentPageData.wordValue;
    }
    return problems.every((_, i) =>
      mode === 'manual' ? currentPageData.drawings[i] : (currentPageData.values[i] && currentPageData.values[i] !== '')
    );
  };

  // Navigate pages (no auto-check)
  const goToPage = (newIdx) => {
    if (newIdx < 0 || newIdx >= PAGES_PER_BOOKLET) return;
    setPageIdx(newIdx);
    setFocusedIdx(0);
  };

  const allPagesFilled = useMemo(() => {
    for (let p = 0; p < PAGES_PER_BOOKLET; p++) {
      const data = pageData[p] || { values: {}, drawings: {}, wordValue: '', wordDrawing: null };
      const isWord = hasWordProblems(level.id) && (p + 1) === PAGES_PER_BOOKLET;
      if (isWord) {
        const filled = mode === 'manual' ? !!data.wordDrawing : !!data.wordValue;
        if (!filled) return false;
      } else {
        const probs = generateProblemsForPage(level.id, bookletNum, p + 1);
        const filled = probs.every((_, i) =>
          mode === 'manual' ? data.drawings[i] : (data.values[i] && data.values[i] !== '')
        );
        if (!filled) return false;
      }
    }
    return true;
  }, [pageData, level.id, bookletNum, mode]);

  // === REVIEW (called at end of last page) ===
  const startReview = () => {
    if (mode === 'manual') {
      // Manual mode: skip check, send to parent for review
      const pages = [];
      for (let p = 0; p < PAGES_PER_BOOKLET; p++) {
        const data = pageData[p] || { drawings: {}, wordDrawing: null };
        const isWord = hasWordProblems(level.id) && (p + 1) === PAGES_PER_BOOKLET;
        if (isWord) {
          const wp = generateWordProblem(level.id, bookletNum);
          pages.push({
            ref: pageRef(level.id, bookletNum, p + 1),
            pageInBooklet: p + 1,
            isWordPage: true,
            problems: [{ ...wp, wordText: wp.text, drawing: data.wordDrawing, firstTryAnswer: null, firstTryCorrect: null }],
          });
        } else {
          const probs = generateProblemsForPage(level.id, bookletNum, p + 1);
          pages.push({
            ref: pageRef(level.id, bookletNum, p + 1),
            pageInBooklet: p + 1,
            isWordPage: false,
            problems: probs.map((pr, i) => ({
              ...pr, drawing: data.drawings[i] || null,
              firstTryAnswer: null, firstTryCorrect: null,
            })),
          });
        }
      }
      finalizeSession(pages, true);
      return;
    }
    // Auto-check all pages
    const results = [];
    for (let p = 0; p < PAGES_PER_BOOKLET; p++) {
      const data = pageData[p] || { values: {}, wordValue: '' };
      const isWord = hasWordProblems(level.id) && (p + 1) === PAGES_PER_BOOKLET;
      if (isWord) {
        const wp = generateWordProblem(level.id, bookletNum);
        const ua = parseInt(data.wordValue, 10);
        const correct = ua === wp.answer;
        results.push({
          pageInBooklet: p + 1, isWordPage: true,
          problems: [{
            ...wp, wordText: wp.text,
            firstTryAnswer: ua, firstTryCorrect: correct,
          }],
        });
      } else {
        const probs = generateProblemsForPage(level.id, bookletNum, p + 1);
        results.push({
          pageInBooklet: p + 1, isWordPage: false,
          problems: probs.map((pr, i) => {
            const ua = parseInt(data.values[i], 10);
            return { ...pr, firstTryAnswer: ua, firstTryCorrect: ua === pr.answer };
          }),
        });
      }
    }
    setPageResults(results);
    setPhase('reviewing');
  };

  // Calculate counts
  const reviewStats = useMemo(() => {
    if (phase !== 'reviewing' && phase !== 'correcting') return null;
    let correct = 0, wrong = 0;
    pageResults.forEach(pg => pg.problems.forEach(p => {
      if (p.firstTryCorrect === true) correct++;
      else if (p.firstTryCorrect === false) wrong++;
    }));
    return { correct, wrong, total: correct + wrong };
  }, [phase, pageResults]);

  // After review: start correcting pages that have errors
  const startCorrecting = () => {
    // Find first page with errors
    const firstErrorPage = pageResults.findIndex(pg => pg.problems.some(p => !p.firstTryCorrect));
    if (firstErrorPage === -1) {
      // Nothing to correct, finalize
      finalizeSession(buildFinalPages(pageResults), false);
      return;
    }
    setCorrectingPageIdx(firstErrorPage);
    // Pre-fill correct answers, clear wrong ones
    const pgResult = pageResults[firstErrorPage];
    if (pgResult.isWordPage) {
      const p = pgResult.problems[0];
      if (p.firstTryCorrect) {
        setCorrectingWordValue(String(p.firstTryAnswer ?? ''));
      } else {
        setCorrectingWordValue('');
      }
    } else {
      const vals = {};
      pgResult.problems.forEach((p, i) => {
        if (p.firstTryCorrect) vals[i] = String(p.firstTryAnswer);
        else vals[i] = '';
      });
      setCorrectingValues(vals);
    }
    setPhase('correcting');
  };

  const goToCorrectingPage = (newIdx) => {
    setCorrectingPageIdx(newIdx);
    const pgResult = pageResults[newIdx];
    if (pgResult.isWordPage) {
      const p = pgResult.problems[0];
      if (p.firstTryCorrect) setCorrectingWordValue(String(p.firstTryAnswer ?? ''));
      else setCorrectingWordValue('');
    } else {
      const vals = {};
      pgResult.problems.forEach((p, i) => {
        if (p.firstTryCorrect) vals[i] = String(p.firstTryAnswer);
        else vals[i] = '';
      });
      setCorrectingValues(vals);
    }
    setCorrectingDrawings({});
    setCorrectingWordDrawing(null);
  };

  const checkCorrections = () => {
    const pgResult = pageResults[correctingPageIdx];
    if (pgResult.isWordPage) {
      const p = pgResult.problems[0];
      const ua = parseInt(correctingWordValue, 10);
      if (ua !== p.answer) {
        // still wrong, keep them here
        return;
      }
    } else {
      // Check all problems on this page that weren't correct first try
      const stillWrong = pgResult.problems.some((p, i) => {
        if (p.firstTryCorrect) return false;
        const ua = parseInt(correctingValues[i], 10);
        return ua !== p.answer;
      });
      if (stillWrong) return;
    }
    // Move to next page with errors
    const nextErrorPage = pageResults.findIndex((pg, idx) =>
      idx > correctingPageIdx && pg.problems.some(p => !p.firstTryCorrect)
    );
    if (nextErrorPage === -1) {
      finalizeSession(buildFinalPages(pageResults), false);
    } else {
      goToCorrectingPage(nextErrorPage);
    }
  };

  const buildFinalPages = (results) => {
    return results.map(pg => ({
      ref: pageRef(level.id, bookletNum, pg.pageInBooklet),
      pageInBooklet: pg.pageInBooklet,
      isWordPage: pg.isWordPage,
      problems: pg.problems.map(p => ({
        ...p,
        finalCorrect: true,
      })),
    }));
  };

  const finalizeSession = (pages, isManual) => {
    const totalProblems = pages.reduce((a, p) => a + p.problems.length, 0);
    const firstTryCorrect = isManual ? null : pages.reduce(
      (a, pg) => a + pg.problems.filter(p => p.firstTryCorrect).length, 0
    );
    const session = {
      id: 'sess_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      kidId: kid.id, levelId: level.id, bookletNum, mode,
      pages, totalProblems, firstTryCorrect,
      score: firstTryCorrect, needsReview: isManual,
      durationSec: firstTryDurationSec + correctionDurationSec,
      firstTryDurationSec,
      correctionDurationSec,
      pausedSec,
      timestamp: Date.now(),
    };
    onComplete(session);
  };

  // ============================================================
  // RENDER
  // ============================================================

  if (phase === 'reviewing') {
    return (
      <Paper>
        <div className="max-w-3xl mx-auto px-6 pt-10 pb-16">
          <div className="rounded-3xl p-6 sm:p-8 text-center" style={{ background: c.soft, border: `2px solid ${c.ink}` }}>
            <div className="text-xs uppercase tracking-[0.3em]" style={{ color: c.strong }}>
              Cahier {bookletNum} terminé · Vérification
            </div>
            <div className="font-display text-6xl sm:text-7xl mt-3 leading-none" style={{ color: c.strong }}>
              {reviewStats.correct}<span className="text-2xl sm:text-3xl opacity-50">/{reviewStats.total}</span>
            </div>
            <div className="text-sm text-stone-700 mt-2">
              {reviewStats.wrong > 0
                ? `${reviewStats.wrong} erreur${reviewStats.wrong > 1 ? 's' : ''} à corriger`
                : 'Aucune erreur ! Tu peux finaliser.'}
            </div>
            <div className="mt-3 text-xs text-stone-600">Temps du 1er essai : {fmtDurLong(firstTryDurationSec)}</div>
          </div>

          <div className="mt-6 bg-white rounded-2xl border-2 border-stone-200 p-5">
            <div className="text-xs uppercase tracking-widest text-stone-500 mb-3">Par feuille</div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {pageResults.map((pg, i) => {
                const pageCorrect = pg.problems.filter(p => p.firstTryCorrect).length;
                const pageTotal = pg.problems.length;
                const pagePct = pageCorrect / pageTotal;
                return (
                  <div key={i} className="rounded-xl p-2.5 text-center border-2"
                    style={{
                      background: '#fafaf9',
                      borderColor: pagePct === 1 ? '#a7f3d0' : pagePct === 0 ? '#fecaca' : '#fde68a',
                    }}>
                    <div className="font-kumon text-xs text-stone-500 tabular-nums">
                      {pageRef(level.id, bookletNum, pg.pageInBooklet).trim()}
                      {pg.isWordPage && <span className="text-[8px] block">Mot</span>}
                    </div>
                    <div className="font-display text-xl mt-1 tabular-nums"
                      style={{ color: pagePct >= 0.8 ? '#047857' : pagePct >= 0.5 ? '#b45309' : '#be123c' }}>
                      {pageCorrect}<span className="text-xs opacity-60">/{pageTotal}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {reviewStats.wrong > 0 && (
            <div className="mt-6 bg-white rounded-2xl border-2 border-rose-200 p-5">
              <div className="text-xs uppercase tracking-widest text-rose-700 mb-3">À revoir ({reviewStats.wrong})</div>
              <div className="space-y-1.5 font-mono tabular-nums text-sm">
                {pageResults.flatMap((pg, pi) =>
                  pg.problems.map((p, qi) =>
                    p.firstTryCorrect === false ? (
                      <div key={`${pi}-${qi}`} className="flex items-center gap-2 text-stone-700">
                        <span className="text-[10px] text-stone-400 w-12">{pageRef(level.id, bookletNum, pg.pageInBooklet).trim()}</span>
                        <span className="flex-1 font-kumon text-base">
                          {p.wordText ? p.wordText.slice(0, 50) + '...' : `${p.a} ${p.op} ${p.b}`} = <span className="line-through text-rose-700">{p.firstTryAnswer ?? '—'}</span> → <span className="text-emerald-700">{p.answer}</span>
                        </span>
                      </div>
                    ) : null
                  ).filter(Boolean)
                )}
              </div>
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-3 justify-center">
            {reviewStats.wrong > 0 ? (
              <Btn onClick={startCorrecting}>↻ Corriger les erreurs</Btn>
            ) : (
              <Btn onClick={() => finalizeSession(buildFinalPages(pageResults), false)}>
                ✓ Finaliser le cahier
              </Btn>
            )}
          </div>
        </div>
      </Paper>
    );
  }

  if (phase === 'correcting') {
    const pgResult = pageResults[correctingPageIdx];
    const isWordCorrection = pgResult.isWordPage;
    const correctRef = pageRef(level.id, bookletNum, pgResult.pageInBooklet);
    const remainingErrors = pageResults.reduce((a, pg, idx) =>
      idx >= correctingPageIdx ? a + pg.problems.filter(p => !p.firstTryCorrect).length : a, 0);

    return (
      <Paper>
        {isPaused && <PauseOverlay onResume={() => setIsPaused(false)} />}
        <div className="max-w-3xl mx-auto px-6 pt-5 pb-3">
          <div className="flex items-center justify-between gap-2">
            <button onClick={onAbort} className="text-sm text-stone-500 hover:text-stone-900">← Quitter</button>
            <div className="text-xs uppercase tracking-widest text-rose-700">
              Correction · Feuille {pgResult.pageInBooklet}/{PAGES_PER_BOOKLET}
            </div>
            <button onClick={() => setIsPaused(true)}
              className="text-sm bg-stone-100 hover:bg-stone-200 px-3 py-1.5 rounded-lg">⏸</button>
          </div>
          <div className="mt-3 rounded-xl bg-rose-50 border border-rose-200 p-3 text-center">
            <div className="text-rose-900 text-sm font-medium">
              ✗ {remainingErrors} erreur{remainingErrors > 1 ? 's' : ''} restante{remainingErrors > 1 ? 's' : ''} — retape la bonne réponse
            </div>
          </div>
        </div>

        <div className="px-4 pb-6">
          {isWordCorrection ? (
            <WordProblemPage
              pageRef={correctRef}
              wordProblem={pgResult.problems[0]}
              value={correctingWordValue}
              drawing={correctingWordDrawing}
              onValueChange={setCorrectingWordValue}
              onDrawingChange={setCorrectingWordDrawing}
              onFocus={() => {}}
              isFocused={true}
              mode={mode}
              accent={c.ink}
            />
          ) : (
            <div className="bg-white rounded-2xl shadow-sm p-6 sm:p-10 max-w-2xl mx-auto" style={{ minHeight: 500 }}>
              <div className="font-kumon text-xl sm:text-2xl text-stone-900 tracking-wide tabular-nums">
                {correctRef.trim()}
              </div>
              <div className="mt-8 sm:mt-12 space-y-4 sm:space-y-5">
                {pgResult.problems.map((p, i) => {
                  const globalNum = (pgResult.pageInBooklet - 1) * PROBLEMS_PER_PAGE + i + 1;
                  const isCorrect = p.firstTryCorrect;
                  const ua = parseInt(correctingValues[i], 10);
                  const nowCorrect = !isCorrect && ua === p.answer;
                  const useColumn = (p.a >= 10 || p.b >= 10) && (p.op === '+' || p.op === '−' || p.op === '×' || p.op === '÷');
                  if (useColumn) {
                    return (
                      <div key={i} className="flex items-start gap-2 sm:gap-4">
                        <div className="font-kumon text-stone-400 text-xs sm:text-sm tabular-nums w-7 sm:w-9 text-right shrink-0 pt-3">
                          ({globalNum})
                        </div>
                        <div className="flex-1 flex justify-start" onClick={() => setFocusedIdx(i)}>
                          <ColumnProblem
                            a={p.a} b={p.b} op={p.op}
                            answer={p.answer}
                            currentInput={isCorrect ? String(p.answer) : (correctingValues[i] || '')}
                            inputMode={mode === 'manual' ? 'keypad' : mode}
                            accent={isCorrect ? '#047857' : nowCorrect ? '#047857' : '#be123c'}
                            showCarries={true}
                            feedback={isCorrect || nowCorrect ? 'correct' : null}
                            resetSignal={`${correctRef}-${i}-review`}
                          />
                          {(isCorrect || nowCorrect) && <span className="text-emerald-600 text-xl ml-2 self-center">✓</span>}
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div key={i} className="flex items-center gap-2 sm:gap-4">
                      <div className="font-kumon text-stone-400 text-xs sm:text-sm tabular-nums w-7 sm:w-9 text-right shrink-0">
                        ({globalNum})
                      </div>
                      <div className="font-kumon text-xl sm:text-3xl text-stone-900 tabular-nums flex items-center gap-2 sm:gap-3 flex-1">
                        <span className="text-right">{p.a}</span>
                        <span className="text-stone-700">{p.op}</span>
                        <span className="text-right">{p.b}</span>
                        <span>=</span>
                        <input
                          type="text" inputMode="numeric" pattern="[0-9]*"
                          value={correctingValues[i] || ''}
                          onChange={e => setCorrectingValues({ ...correctingValues, [i]: e.target.value.replace(/\D/g, '').slice(0, 5) })}
                          onFocus={() => setFocusedIdx(i)}
                          disabled={isCorrect}
                          className="font-kumon text-xl sm:text-3xl bg-transparent outline-none border-0 tabular-nums w-20 sm:w-28"
                          style={{
                            borderBottom: `2px solid ${isCorrect ? '#047857' : nowCorrect ? '#047857' : '#be123c'}`,
                            color: isCorrect ? '#047857' : nowCorrect ? '#047857' : '#1c1917',
                          }} />
                        {isCorrect && <span className="text-emerald-600 text-xl ml-1">✓</span>}
                        {nowCorrect && <span className="text-emerald-600 text-xl ml-1">✓</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="px-6 pb-10 max-w-3xl mx-auto">
          {mode === 'keypad' && (
            <div className="mb-5">
              <NumPad
                onDigit={d => {
                  if (isWordCorrection) {
                    setCorrectingWordValue(v => (v + d).slice(0, 5));
                  } else {
                    const cur = correctingValues[focusedIdx] || '';
                    if (pgResult.problems[focusedIdx]?.firstTryCorrect) return;
                    setCorrectingValues({ ...correctingValues, [focusedIdx]: (cur + d).slice(0, 5) });
                  }
                }}
                onClear={() => {
                  if (isWordCorrection) setCorrectingWordValue(v => v.slice(0, -1));
                  else setCorrectingValues({ ...correctingValues, [focusedIdx]: (correctingValues[focusedIdx] || '').slice(0, -1) });
                }}
                onNext={() => {
                  if (!isWordCorrection) {
                    for (let i = focusedIdx + 1; i < pgResult.problems.length; i++) {
                      if (!pgResult.problems[i].firstTryCorrect) { setFocusedIdx(i); return; }
                    }
                    for (let i = 0; i < focusedIdx; i++) {
                      if (!pgResult.problems[i].firstTryCorrect) { setFocusedIdx(i); return; }
                    }
                  }
                }} />
            </div>
          )}
          <div className="flex justify-center gap-3">
            <button onClick={checkCorrections}
              className="px-8 py-3 rounded-xl bg-rose-700 text-white font-medium hover:bg-rose-800 transition-all active:scale-95">
              Vérifier mes corrections ✓
            </button>
          </div>
        </div>
      </Paper>
    );
  }

  // PHASE: doing
  return (
    <Paper>
      {isPaused && <PauseOverlay onResume={() => setIsPaused(false)} />}
      <div className="max-w-3xl mx-auto px-6 pt-5 pb-3">
        <div className="flex items-center justify-between gap-2">
          <button onClick={onAbort} className="text-sm text-stone-500 hover:text-stone-900">← Quitter</button>
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-2 h-2 rounded-full shrink-0" style={{ background: info.dot }}></div>
            <div className="text-xs uppercase tracking-widest text-stone-600 truncate">
              {level.id} · Cahier {bookletNum}{bookletLabel ? ` · ${bookletLabel}` : ''} · {pageInBooklet}/{PAGES_PER_BOOKLET}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="font-mono text-sm text-stone-700 tabular-nums">{fmtDur(activeSec)}</div>
            <button onClick={() => setIsPaused(true)}
              className="text-sm bg-stone-100 hover:bg-stone-200 px-2 py-1 rounded-lg">⏸</button>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-1 justify-center">
          {Array.from({ length: PAGES_PER_BOOKLET }, (_, i) => {
            const data = pageData[i];
            const isFilled = (() => {
              if (!data) return false;
              const isWord = hasWordProblems(level.id) && (i + 1) === PAGES_PER_BOOKLET;
              if (isWord) return mode === 'manual' ? !!data.wordDrawing : !!data.wordValue;
              const probs = generateProblemsForPage(level.id, bookletNum, i + 1);
              return probs.every((_, qi) => mode === 'manual' ? data.drawings[qi] : (data.values[qi] && data.values[qi] !== ''));
            })();
            return (
              <button key={i} onClick={() => goToPage(i)}
                className="h-2 rounded-full transition-all"
                style={{
                  width: i === pageIdx ? 32 : 12,
                  background: isFilled ? c.ink : '#d6d3d1',
                  opacity: i === pageIdx ? 1 : isFilled ? 0.9 : 0.4,
                }}></button>
            );
          })}
        </div>
        <div className="text-center text-xs text-stone-500 mt-2">
          Feuille {pageInBooklet}/{PAGES_PER_BOOKLET}{isWordPage ? ' · 📖 Mot problème' : ''}
        </div>
      </div>

      <div className="px-4 pb-6">
        {isWordPage && wordProblem ? (
          <WordProblemPage
            pageRef={ref}
            wordProblem={wordProblem}
            value={currentPageData.wordValue}
            drawing={currentPageData.wordDrawing}
            onValueChange={onWordValueChange}
            onDrawingChange={onWordDrawingChange}
            onFocus={() => setFocusedIdx(0)}
            isFocused={true}
            mode={mode}
            accent={c.ink}
          />
        ) : (
          <KumonWorksheetPage
            pageRef={ref} problems={problems} startIndex={startIndex}
            values={currentPageData.values} drawings={currentPageData.drawings}
            onValueChange={onValueChange} onDrawingChange={onDrawingChange}
            onFocus={setFocusedIdx} focusedIdx={focusedIdx}
            mode={mode} accent={c.ink} />
        )}
      </div>

      <div className="px-6 pb-10 max-w-3xl mx-auto">
        {mode === 'keypad' && (
          <div className="mb-5">
            <NumPad onDigit={keypadDigit} onClear={keypadClear} onNext={keypadNext} />
            {!isWordPage && (
              <div className="text-center text-[10px] uppercase tracking-widest text-stone-500 mt-2">
                Touche un blanc pour le sélectionner · ↓ va au suivant
              </div>
            )}
          </div>
        )}
        {mode === 'pencil' && !isWordPage && (
          <div className="text-center text-xs uppercase tracking-widest text-stone-500 mb-5">
            Touche un blanc et écris avec le crayon Apple
          </div>
        )}
        {mode === 'manual' && (
          <div className="text-center text-xs uppercase tracking-widest text-stone-500 mb-5">
            Écris à la main · le parent corrigera plus tard
          </div>
        )}

        <div className="flex justify-center gap-3 flex-wrap">
          {pageIdx > 0 && (
            <Btn variant="soft" onClick={() => goToPage(pageIdx - 1)}>← Précédente</Btn>
          )}
          {pageIdx < PAGES_PER_BOOKLET - 1 ? (
            <Btn onClick={() => goToPage(pageIdx + 1)} disabled={!isCurrentPageFilled()}>
              Feuille suivante →
            </Btn>
          ) : (
            <button onClick={startReview} disabled={!allPagesFilled}
              className="px-8 py-3 rounded-xl bg-emerald-700 text-white font-medium hover:bg-emerald-800 transition-all active:scale-95 disabled:opacity-30">
              ✓ Vérifier le cahier
            </button>
          )}
        </div>
        {pageIdx === PAGES_PER_BOOKLET - 1 && !allPagesFilled && (
          <div className="mt-3 text-center text-xs text-stone-500">
            Remplis toutes les feuilles avant de vérifier
          </div>
        )}
      </div>
    </Paper>
  );

  // Helper inside component
  function hasWordProblems(levelId) {
    const l = LEVELS.find(ll => ll.id === levelId);
    return l?.hasWordProblems ?? false;
  }
}

// ============================================================
// FIREWORKS (canvas, full-screen, ~5 seconds)
// ============================================================
function Fireworks({ onDone }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.scale(dpr, dpr);

    const particles = [];
    const colors = ['#fbbf24', '#f59e0b', '#ef4444', '#ec4899', '#a855f7', '#3b82f6', '#10b981', '#06b6d4', '#f97316'];

    function burst(x, y, palette) {
      const count = 50 + Math.floor(Math.random() * 30);
      const baseAngle = Math.random() * Math.PI * 2;
      for (let i = 0; i < count; i++) {
        const angle = baseAngle + (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.2;
        const speed = 1.5 + Math.random() * 4.5;
        particles.push({
          x, y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          color: palette[Math.floor(Math.random() * palette.length)],
          life: 1,
          decay: 0.008 + Math.random() * 0.008,
          size: 2 + Math.random() * 2.5,
          glow: Math.random() < 0.3,
        });
      }
    }

    // Schedule 10 bursts over ~5 seconds
    const startTime = Date.now();
    const burstSchedule = [];
    for (let i = 0; i < 10; i++) {
      burstSchedule.push({
        time: i * 450 + Math.random() * 200,
        x: w * 0.15 + Math.random() * w * 0.7,
        y: h * 0.15 + Math.random() * h * 0.45,
        palette: (() => {
          // Pick 2-3 harmonious colors
          const shuffled = [...colors].sort(() => Math.random() - 0.5);
          return shuffled.slice(0, 2 + Math.floor(Math.random() * 2));
        })(),
      });
    }
    let nextBurstIdx = 0;

    let animId;
    let totalDone = false;
    function animate() {
      // Soft fading trail
      ctx.fillStyle = 'rgba(28, 25, 23, 0.18)';
      ctx.fillRect(0, 0, w, h);

      const elapsed = Date.now() - startTime;
      while (nextBurstIdx < burstSchedule.length && elapsed >= burstSchedule[nextBurstIdx].time) {
        const b = burstSchedule[nextBurstIdx];
        burst(b.x, b.y, b.palette);
        nextBurstIdx++;
      }

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.06; // gravity
        p.vx *= 0.992; // air drag
        p.vy *= 0.992;
        p.life -= p.decay;
        if (p.life <= 0) { particles.splice(i, 1); continue; }

        if (p.glow) {
          ctx.shadowBlur = 12;
          ctx.shadowColor = p.color;
        } else {
          ctx.shadowBlur = 0;
        }
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.5 + p.life * 0.5), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;

      const allBurstsScheduled = nextBurstIdx >= burstSchedule.length;
      if (!allBurstsScheduled || particles.length > 0) {
        animId = requestAnimationFrame(animate);
      } else if (!totalDone) {
        totalDone = true;
        if (onDone) onDone();
      }
    }
    animate();

    return () => { if (animId) cancelAnimationFrame(animId); };
  }, [onDone]);

  return (
    <canvas ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-40"
      style={{ background: 'transparent' }} />
  );
}

// ============================================================
// SCREEN: RESULTS
// ============================================================
function Results({ session, kid, parentEmail, justUnlockedNext, onRetry, onContinue, onDone }) {
  const c = KID_COLORS[kid.color] || KID_COLORS.teal;
  const lvl = levelById(session.levelId);
  const isManual = session.needsReview;
  const total = session.totalProblems;
  const correct = session.firstTryCorrect;
  const pct = isManual ? null : Math.round(correct / total * 100);
  const verdict = isManual ? 'En attente' : pct === 100 ? 'PARFAIT !' : pct >= 90 ? 'Excellent' : pct >= 75 ? 'Très bien' : pct >= 50 ? 'Bon effort' : 'À reprendre';
  const bookletLabel = getBookletLabel(lvl.id, session.bookletNum);
  const isPerfect = !isManual && pct === 100;
  const firstTry = session.firstTryDurationSec ?? session.durationSec ?? 0;
  const correction = session.correctionDurationSec ?? 0;
  const totalActive = firstTry + correction;

  return (
    <Paper>
      {isPerfect && <Fireworks />}
      <div className="max-w-3xl mx-auto px-6 pt-10 pb-16 relative z-10">
        <div className="rounded-3xl p-8 sm:p-10 text-center" style={{
          background: isPerfect ? 'linear-gradient(135deg, #fef3c7 0%, #fde68a 50%, #fef3c7 100%)' : c.soft,
          border: `2px solid ${isPerfect ? '#f59e0b' : c.ink}`,
          boxShadow: isPerfect ? '0 0 60px rgba(251, 191, 36, 0.4)' : 'none',
        }}>
          <div className="text-xs uppercase tracking-[0.3em]" style={{ color: isPerfect ? '#92400e' : c.strong }}>
            {lvl?.id} · Cahier {session.bookletNum}{bookletLabel ? ` · ${bookletLabel}` : ''}
          </div>
          {isManual ? (
            <>
              <div className="font-display text-6xl mt-4 leading-none" style={{ color: c.strong }}>✓</div>
              <div className="font-display text-2xl mt-3 text-stone-900">Bravo {kid.name} !</div>
              <div className="mt-4 text-sm text-stone-700 px-6">
                Toutes tes réponses ont été enregistrées.<br/>Un parent va les corriger.
              </div>
            </>
          ) : (
            <>
              {isPerfect && (
                <div className="text-5xl sm:text-6xl mt-3 animate-bounce">🎉</div>
              )}
              <div className="font-display text-7xl sm:text-8xl mt-3 leading-none" style={{ color: isPerfect ? '#b45309' : c.strong }}>
                {correct}<span className="text-3xl sm:text-4xl opacity-50">/{total}</span>
              </div>
              <div className="font-display text-2xl sm:text-3xl mt-3 text-stone-900" style={isPerfect ? { letterSpacing: '0.05em' } : {}}>
                {verdict}
              </div>
              <div className="mt-2 text-xs text-stone-600">Score au 1er essai</div>
              <div className="mt-5 flex justify-center gap-x-6 gap-y-2 text-sm text-stone-700 flex-wrap">
                <div><span className="font-mono tabular-nums">{pct}%</span></div>
                <div className="text-stone-400">·</div>
                <div>⏱ <span className="font-mono tabular-nums">{fmtDurLong(totalActive)}</span></div>
                {correction > 0 && (
                  <div className="text-stone-500 text-xs w-full sm:w-auto">
                    (1er essai : {fmtDur(firstTry)} · correction : {fmtDur(correction)})
                  </div>
                )}
                {session.pausedSec > 0 && (
                  <div className="text-stone-400 text-xs w-full sm:w-auto">Pauses : {fmtDurLong(session.pausedSec)}</div>
                )}
              </div>
            </>
          )}
        </div>

        {justUnlockedNext && (
          <div className="mt-5 rounded-2xl bg-emerald-50 border-2 border-emerald-200 p-4 text-center">
            <div className="font-display text-lg text-emerald-900">🎉 Niveau {lvl?.id} complété !</div>
            <div className="text-sm text-emerald-800 mt-1">Le niveau {justUnlockedNext.id} ({justUnlockedNext.name}) est maintenant débloqué.</div>
          </div>
        )}

        <div className="mt-8 flex flex-wrap gap-3 justify-center">
          <Btn variant="soft" onClick={onRetry}>↻ Refaire</Btn>
          <a href={buildMailto(session, kid, parentEmail)}
            className="px-5 py-3 rounded-xl font-medium bg-stone-900 text-stone-50 hover:bg-stone-800 transition-all active:scale-95 inline-flex items-center gap-2">
            ✉ Envoyer par courriel
          </a>
          <Btn onClick={onContinue}>Cahier suivant →</Btn>
        </div>
        <div className="mt-3 text-center">
          <button onClick={onDone} className="text-sm text-stone-500 hover:text-stone-900">← Accueil</button>
        </div>
      </div>
    </Paper>
  );
}

// ============================================================
// PARENT GATE
// ============================================================
function ParentGate({ pin, onSuccess, onBack }) {
  const [entered, setEntered] = useState('');
  const [error, setError] = useState(false);

  useEffect(() => {
    if (entered.length === 4) {
      if (entered === pin) onSuccess();
      else { setError(true); setTimeout(() => { setEntered(''); setError(false); }, 600); }
    }
  }, [entered, pin, onSuccess]);

  return (
    <Paper>
      <div className="max-w-md mx-auto px-6 pt-16 pb-16 min-h-screen flex flex-col">
        <button onClick={onBack} className="text-sm text-stone-500 hover:text-stone-900 self-start">← Retour</button>
        <div className="flex-1 flex flex-col items-center justify-center">
          <div className="text-4xl mb-3">🔒</div>
          <div className="font-display text-3xl text-stone-900">Accès parent</div>
          <div className="text-sm text-stone-500 mt-2">Entre le NIP à 4 chiffres</div>
          <div className={`mt-6 ${error ? 'animate-shake' : ''}`}>
            <PinPad value={entered} onChange={setEntered} />
          </div>
          {error && <div className="text-xs text-rose-700 mt-3">NIP incorrect</div>}
          <div className="mt-6 text-xs text-stone-400">NIP par défaut : 1234</div>
        </div>
      </div>
    </Paper>
  );
}

// ============================================================
// PARENT DASHBOARD
// ============================================================
function ParentDashboard({ config, sessions, progress, manualUnlocks, onUpdateConfig, onDeleteSession, onUpdateSession, onResetProgress, onToggleManualUnlock, onSetCompletedBooklets, onBack }) {
  const [tab, setTab] = useState('overview');
  const [reviewing, setReviewing] = useState(null);
  const [viewing, setViewing] = useState(null);
  const pending = sessions.filter(s => s.needsReview);

  return (
    <Paper>
      <div className="max-w-5xl mx-auto px-6 sm:px-8 pt-10 pb-6">
        <button onClick={onBack} className="text-sm text-stone-500 hover:text-stone-900 mb-4">← Accueil</button>
        <div className="flex items-baseline justify-between">
          <h1 className="font-display text-3xl sm:text-4xl text-stone-900">Tableau parent</h1>
          <div className="text-xs uppercase tracking-widest text-stone-500">{sessions.length} cahier{sessions.length > 1 ? 's' : ''}</div>
        </div>
        <div className="mt-6 flex gap-1 border-b border-stone-300 overflow-x-auto">
          {[
            { id: 'overview', label: 'Vue d\'ensemble' },
            { id: 'time', label: 'Temps' },
            { id: 'progression', label: 'Niveaux' },
            { id: 'review', label: 'À corriger', badge: pending.length },
            { id: 'sessions', label: 'Cahiers' },
            { id: 'settings', label: 'Réglages' },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-2.5 text-sm transition-colors relative whitespace-nowrap ${tab === t.id ? 'text-stone-900' : 'text-stone-500 hover:text-stone-700'}`}>
              <span>{t.label}</span>
              {t.badge > 0 && (
                <span className="ml-2 bg-rose-600 text-white text-[10px] rounded-full px-1.5 py-0.5 font-bold">{t.badge}</span>
              )}
              {tab === t.id && <div className="absolute -bottom-px left-0 right-0 h-0.5 bg-stone-900"></div>}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 sm:px-8 pb-16">
        {tab === 'overview' && <OverviewTab config={config} sessions={sessions} progress={progress} manualUnlocks={manualUnlocks} />}
        {tab === 'time' && <TimeTab config={config} sessions={sessions} />}
        {tab === 'progression' && (
          <ProgressionTab config={config} progress={progress} manualUnlocks={manualUnlocks}
            onResetProgress={onResetProgress}
            onToggleManualUnlock={onToggleManualUnlock}
            onSetCompletedBooklets={onSetCompletedBooklets} />
        )}
        {tab === 'review' && <ReviewTab config={config} sessions={pending} onReview={setReviewing} />}
        {tab === 'sessions' && <SessionsTab config={config} sessions={sessions} onSelect={setViewing} onDelete={onDeleteSession} />}
        {tab === 'settings' && <SettingsTab config={config} onUpdate={onUpdateConfig} />}
      </div>

      {reviewing && (
        <ReviewModal session={reviewing}
          kid={config.kids.find(k => k.id === reviewing.kidId)}
          onSave={(updated) => { onUpdateSession(updated); setReviewing(null); }}
          onClose={() => setReviewing(null)} />
      )}
      {viewing && (
        <SessionDetailModal session={viewing}
          kid={config.kids.find(k => k.id === viewing.kidId)}
          parentEmail={config.parentEmail}
          onClose={() => setViewing(null)} />
      )}
    </Paper>
  );
}

function OverviewTab({ config, sessions, progress, manualUnlocks }) {
  const visibleKids = config.kids.filter(k => k.name?.trim());
  const chartData = useMemo(() => {
    const days = 14;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const out = [];
    for (let i = days - 1; i >= 0; i--) {
      const day = new Date(today.getTime() - i * 86400000);
      const dayEnd = day.getTime() + 86400000;
      const row = { date: day.toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' }) };
      for (const kid of visibleKids) {
        const ks = sessions.filter(s => !s.needsReview && s.kidId === kid.id && s.timestamp >= day.getTime() && s.timestamp < dayEnd);
        row[kid.name] = ks.length > 0 ? Math.round(ks.reduce((a, s) => a + s.firstTryCorrect / s.totalProblems * 100, 0) / ks.length) : null;
      }
      out.push(row);
    }
    return out;
  }, [sessions, visibleKids]);

  return (
    <div className="space-y-6 mt-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {visibleKids.map(kid => {
          const c = KID_COLORS[kid.color] || KID_COLORS.teal;
          const kSessions = sessions.filter(s => s.kidId === kid.id && !s.needsReview);
          const total = kSessions.length;
          const avgPct = total > 0 ? Math.round(kSessions.reduce((a, s) => a + s.firstTryCorrect / s.totalProblems * 100, 0) / total) : 0;
          const totalTime = sessions.filter(s => s.kidId === kid.id).reduce((a, s) => a + (s.durationSec || 0), 0);
          const last7 = sessions.filter(s => s.kidId === kid.id && s.timestamp > Date.now() - 7 * 86400000).length;
          const currentLevel = getCurrentLevel(kid.id, progress, manualUnlocks);
          return (
            <div key={kid.id} className="rounded-2xl p-6 border-2" style={{ background: c.soft, borderColor: c.ink }}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center font-display text-xl text-white"
                  style={{ background: c.ink }}>{kid.name.charAt(0).toUpperCase()}</div>
                <div>
                  <div className="font-display text-xl text-stone-900">{kid.name}</div>
                  <div className="text-[10px] uppercase tracking-widest text-stone-500">
                    {currentLevel ? `${currentLevel.id} · ${currentLevel.name}` : '🎓 Programme complet'}
                  </div>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-stone-500">Cahiers</div>
                  <div className="font-display text-2xl mt-0.5" style={{ color: c.strong }}>{total}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-stone-500">Moy.</div>
                  <div className="font-display text-2xl mt-0.5" style={{ color: c.strong }}>{avgPct}%</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-stone-500">7 jours</div>
                  <div className="font-display text-2xl mt-0.5" style={{ color: c.strong }}>{last7}</div>
                </div>
              </div>
              <div className="mt-3 text-xs text-stone-600 text-center">Temps total : {fmtDurLong(totalTime)}</div>
            </div>
          );
        })}
      </div>

      <div className="rounded-2xl bg-white border-2 border-stone-200 p-6">
        <div className="text-xs uppercase tracking-widest text-stone-500 mb-4">Score moyen au 1er essai (14 derniers jours)</div>
        <div style={{ width: '100%', height: 260 }}>
          <ResponsiveContainer>
            <LineChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#78716c' }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#78716c' }} />
              <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e7e5e4', fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {visibleKids.map(kid => (
                <Line key={kid.id} type="monotone" dataKey={kid.name}
                  stroke={KID_COLORS[kid.color]?.ink || '#0f766e'} strokeWidth={2.5}
                  dot={{ r: 3 }} connectNulls={true} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

// New tab: time per booklet
function TimeTab({ config, sessions }) {
  const visibleKids = config.kids.filter(k => k.name?.trim());
  const [selectedKidId, setSelectedKidId] = useState(visibleKids[0]?.id);
  const kid = config.kids.find(k => k.id === selectedKidId);
  const kSessions = sessions.filter(s => s.kidId === selectedKidId && !s.needsReview)
    .sort((a, b) => b.timestamp - a.timestamp);

  if (!kid) return <div className="mt-4 text-stone-500">Aucun enfant configuré</div>;

  // Aggregate stats — split first-try vs correction
  const totalTime = kSessions.reduce((a, s) => a + (s.durationSec || 0), 0);
  const totalFirstTry = kSessions.reduce((a, s) => a + (s.firstTryDurationSec ?? s.durationSec ?? 0), 0);
  const totalCorrection = kSessions.reduce((a, s) => a + (s.correctionDurationSec || 0), 0);
  const totalPaused = kSessions.reduce((a, s) => a + (s.pausedSec || 0), 0);
  const avgPerBooklet = kSessions.length > 0 ? Math.round(totalTime / kSessions.length) : 0;
  const avgFirstTry = kSessions.length > 0 ? Math.round(totalFirstTry / kSessions.length) : 0;
  const fastest = kSessions.reduce((a, s) => !a || s.durationSec < a.durationSec ? s : a, null);
  const slowest = kSessions.reduce((a, s) => !a || s.durationSec > a.durationSec ? s : a, null);

  // Group by level
  const byLevel = {};
  kSessions.forEach(s => {
    if (!byLevel[s.levelId]) byLevel[s.levelId] = [];
    byLevel[s.levelId].push(s);
  });

  // Last 14-day chart of time spent per day
  const chartData = useMemo(() => {
    const days = 14;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const out = [];
    for (let i = days - 1; i >= 0; i--) {
      const day = new Date(today.getTime() - i * 86400000);
      const dayEnd = day.getTime() + 86400000;
      const dayS = kSessions.filter(s => s.timestamp >= day.getTime() && s.timestamp < dayEnd);
      const minutes = Math.round(dayS.reduce((a, s) => a + s.durationSec, 0) / 60);
      out.push({
        date: day.toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' }),
        minutes: minutes > 0 ? minutes : null,
      });
    }
    return out;
  }, [kSessions]);

  return (
    <div className="mt-4 space-y-5">
      <div className="flex gap-2 flex-wrap">
        {visibleKids.map(k => {
          const c = KID_COLORS[k.color] || KID_COLORS.teal;
          const isActive = k.id === selectedKidId;
          return (
            <button key={k.id} onClick={() => setSelectedKidId(k.id)}
              className={`px-4 py-2 rounded-full text-sm transition-all ${isActive ? 'text-white' : 'bg-stone-100 text-stone-700 hover:bg-stone-200'}`}
              style={isActive ? { background: c.ink } : {}}>
              {k.name}
            </button>
          );
        })}
      </div>

      {kSessions.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-stone-300 p-12 text-center text-stone-500 text-sm">
          Aucun cahier complété pour l'instant
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white rounded-2xl border-2 border-stone-200 p-4 text-center">
              <div className="text-[10px] uppercase tracking-widest text-stone-500">Total</div>
              <div className="font-display text-xl mt-1 text-stone-900">{fmtDurLong(totalTime)}</div>
              {totalCorrection > 0 && (
                <div className="text-[9px] text-stone-500 mt-1">
                  {fmtDur(totalFirstTry)} 1er + {fmtDur(totalCorrection)} corr.
                </div>
              )}
            </div>
            <div className="bg-white rounded-2xl border-2 border-stone-200 p-4 text-center">
              <div className="text-[10px] uppercase tracking-widest text-stone-500">Moy. / cahier</div>
              <div className="font-display text-xl mt-1 text-stone-900">{fmtDur(avgPerBooklet)}</div>
              <div className="text-[9px] text-stone-500 mt-1">1er essai : {fmtDur(avgFirstTry)}</div>
            </div>
            <div className="bg-white rounded-2xl border-2 border-emerald-200 p-4 text-center">
              <div className="text-[10px] uppercase tracking-widest text-emerald-700">Plus rapide</div>
              <div className="font-display text-xl mt-1 text-emerald-800">{fastest ? fmtDur(fastest.durationSec) : '—'}</div>
              {fastest && <div className="text-[10px] text-stone-500 mt-0.5">{fastest.levelId} · Cahier {fastest.bookletNum}</div>}
            </div>
            <div className="bg-white rounded-2xl border-2 border-amber-200 p-4 text-center">
              <div className="text-[10px] uppercase tracking-widest text-amber-700">Plus lent</div>
              <div className="font-display text-xl mt-1 text-amber-800">{slowest ? fmtDur(slowest.durationSec) : '—'}</div>
              {slowest && <div className="text-[10px] text-stone-500 mt-0.5">{slowest.levelId} · Cahier {slowest.bookletNum}</div>}
            </div>
          </div>

          {totalCorrection > 0 && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900 text-center">
              <b>{Math.round(totalCorrection / totalTime * 100)}%</b> du temps total passé en correction d'erreurs
              · {kSessions.filter(s => (s.correctionDurationSec || 0) > 0).length} cahier(s) avec correction sur {kSessions.length}
            </div>
          )}

          {totalPaused > 0 && (
            <div className="text-xs text-stone-500 text-center">
              Pauses cumulées : {fmtDurLong(totalPaused)} (non comptées dans le temps total)
            </div>
          )}

          <div className="rounded-2xl bg-white border-2 border-stone-200 p-5">
            <div className="text-xs uppercase tracking-widest text-stone-500 mb-3">Minutes par jour (14 derniers jours)</div>
            <div style={{ width: '100%', height: 220 }}>
              <ResponsiveContainer>
                <LineChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#78716c' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#78716c' }} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e7e5e4', fontSize: 12 }} />
                  <Line type="monotone" dataKey="minutes" name="Minutes"
                    stroke={KID_COLORS[kid.color]?.ink || '#0f766e'} strokeWidth={2.5}
                    dot={{ r: 3 }} connectNulls={true} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* By level */}
          <div className="bg-white rounded-2xl border-2 border-stone-200 p-5">
            <div className="text-xs uppercase tracking-widest text-stone-500 mb-3">Temps par niveau</div>
            <div className="space-y-3">
              {Object.entries(byLevel).map(([levelId, lSessions]) => {
                const lvl = levelById(levelId);
                const info = lvl ? CAT_INFO[lvl.cat] : null;
                const totalLvl = lSessions.reduce((a, s) => a + s.durationSec, 0);
                const avgLvl = Math.round(totalLvl / lSessions.length);
                return (
                  <div key={levelId} className="flex items-center gap-3 flex-wrap">
                    <div className="font-kumon text-sm w-12 text-stone-700">{levelId}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-stone-900">{lvl?.name}</div>
                      <div className="text-xs text-stone-500">{lSessions.length} cahier{lSessions.length > 1 ? 's' : ''} · moy. {fmtDur(avgLvl)}</div>
                    </div>
                    <div className="font-display text-sm tabular-nums text-stone-700">{fmtDurLong(totalLvl)}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Per-booklet detail */}
          <div className="bg-white rounded-2xl border-2 border-stone-200 p-5">
            <div className="text-xs uppercase tracking-widest text-stone-500 mb-3">Tous les cahiers (récent → ancien)</div>
            <div className="space-y-1.5 max-h-96 overflow-y-auto">
              {kSessions.map(s => {
                const lvl = levelById(s.levelId);
                const ft = s.firstTryDurationSec ?? s.durationSec ?? 0;
                const corr = s.correctionDurationSec || 0;
                const pct = Math.round(s.firstTryCorrect / s.totalProblems * 100);
                return (
                  <div key={s.id} className="flex items-center gap-3 py-1.5 px-2 rounded-lg hover:bg-stone-50 flex-wrap">
                    <div className="font-kumon text-sm w-12 text-stone-700 tabular-nums">{s.levelId}</div>
                    <div className="text-xs text-stone-700 w-20">Cahier {s.bookletNum}</div>
                    <div className="flex-1 min-w-0 text-xs text-stone-500 truncate">{fmtDate(s.timestamp)}</div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <div className="font-mono text-sm tabular-nums text-stone-900">⏱ {fmtDur(s.durationSec)}</div>
                        {corr > 0 && (
                          <div className="text-[10px] text-stone-500 tabular-nums">
                            {fmtDur(ft)} + {fmtDur(corr)} corr.
                          </div>
                        )}
                      </div>
                      {s.pausedSec > 0 && (
                        <div className="text-[10px] text-stone-400">+{fmtDur(s.pausedSec)} pause</div>
                      )}
                      <div className="text-xs font-medium w-12 text-right"
                        style={{ color: pct === 100 ? '#047857' : pct >= 70 ? '#1c1917' : '#b45309' }}>
                        {pct}%{pct === 100 ? ' 🎉' : ''}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ProgressionTab({ config, progress, manualUnlocks, onResetProgress, onToggleManualUnlock, onSetCompletedBooklets }) {
  const visibleKids = config.kids.filter(k => k.name?.trim());
  const [selectedKidId, setSelectedKidId] = useState(visibleKids[0]?.id);
  const [editingLevel, setEditingLevel] = useState(null);
  const kid = config.kids.find(k => k.id === selectedKidId);
  if (!kid) return <div className="mt-4 text-stone-500">Aucun enfant configuré</div>;
  const kidColor = KID_COLORS[kid.color] || KID_COLORS.teal;

  return (
    <div className="mt-4 space-y-4">
      {/* Prominent kid selector — clearly shows we're editing per-child */}
      <div className="rounded-2xl border-2 p-4" style={{ background: kidColor.soft, borderColor: kidColor.ink }}>
        <div className="text-xs uppercase tracking-widest mb-3" style={{ color: kidColor.strong }}>
          Choisis l'enfant dont tu veux modifier les niveaux
        </div>
        <div className="flex gap-2 flex-wrap">
          {visibleKids.map(k => {
            const c = KID_COLORS[k.color] || KID_COLORS.teal;
            const isActive = k.id === selectedKidId;
            return (
              <button key={k.id} onClick={() => { setSelectedKidId(k.id); setEditingLevel(null); }}
                className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-sm font-medium transition-all active:scale-95 ${
                  isActive ? 'text-white shadow-md' : 'bg-white text-stone-700 hover:bg-stone-50 border border-stone-200'
                }`}
                style={isActive ? { background: c.ink } : {}}>
                <div className="w-7 h-7 rounded-lg flex items-center justify-center font-display text-base text-white"
                  style={{ background: isActive ? 'rgba(255,255,255,0.25)' : c.ink }}>
                  {k.name.charAt(0).toUpperCase()}
                </div>
                <span>{k.name}</span>
                {isActive && <span className="text-xs opacity-80">· en cours</span>}
              </button>
            );
          })}
        </div>
        <div className="mt-3 pt-3 border-t flex items-center justify-between gap-2 flex-wrap"
          style={{ borderColor: kidColor.ink + '33' }}>
          <div className="flex items-center gap-2 text-sm" style={{ color: kidColor.strong }}>
            <span>📋</span>
            <span>Tu modifies les niveaux de</span>
            <b className="font-display text-base">{kid.name}</b>
            <span className="text-xs opacity-70">uniquement</span>
          </div>
        </div>
      </div>

      <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900">
        <b>Forcer le déblocage</b> : ajoute un niveau aux niveaux débloqués manuellement (par-dessus le verrouillage normal).<br/>
        <b>Verrouiller un cahier</b> : touche un cahier complété pour le marquer non-fait — l'enfant devra le refaire.<br/>
        <span className="text-amber-700">Les modifications n'affectent que {kid.name}.</span>
      </div>

      <div className="space-y-2">
        {LEVELS.map(lvl => {
          const status = getLevelStatus(kid.id, lvl.id, progress, manualUnlocks);
          const lp = (progress[kid.id] || {})[lvl.id] || { completedBooklets: [] };
          const info = CAT_INFO[lvl.cat];
          const isExpanded = editingLevel === lvl.id;
          const manuallyUnlocked = (manualUnlocks[kid.id] || []).includes(lvl.id);
          const isStage1 = lvl.stage === 1;
          return (
            <div key={lvl.id} className="bg-white rounded-2xl border-2 overflow-hidden"
              style={{
                borderColor: status === 'completed' ? '#047857' :
                             status === 'active' ? info.dot + '60' :
                             '#e7e5e4',
              }}>
              <button onClick={() => setEditingLevel(isExpanded ? null : lvl.id)}
                className="w-full p-3 flex items-center gap-3 hover:bg-stone-50 transition-colors text-left">
                <div className="font-kumon text-base tabular-nums w-10 text-stone-700">
                  {status === 'locked' ? '🔒' : status === 'completed' ? '✓' : lvl.id}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="text-sm font-medium text-stone-900">{lvl.id} · {lvl.name}</div>
                    {manuallyUnlocked && !isStage1 && (
                      <div className="text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800">Forcé</div>
                    )}
                  </div>
                  <div className="h-1.5 bg-stone-100 rounded-full mt-1 overflow-hidden">
                    <div className="h-full rounded-full transition-all"
                      style={{
                        width: `${(lp.completedBooklets.length / BOOKLETS_PER_LEVEL) * 100}%`,
                        background: status === 'completed' ? '#047857' : info.dot,
                      }}></div>
                  </div>
                </div>
                <div className="text-xs font-mono text-stone-500 tabular-nums w-12 text-right">
                  {lp.completedBooklets.length}/{BOOKLETS_PER_LEVEL}
                </div>
                <div className="text-stone-400 text-xs">{isExpanded ? '▲' : '▼'}</div>
              </button>

              {isExpanded && (
                <div className="px-4 pb-4 border-t border-stone-200 pt-3">
                  {!isStage1 && status === 'locked' && (
                    <button onClick={() => onToggleManualUnlock(kid.id, lvl.id, true)}
                      className="w-full mb-3 px-3 py-2 rounded-lg bg-amber-100 text-amber-900 text-sm hover:bg-amber-200 transition-all font-medium">
                      🔓 Forcer le déblocage de ce niveau pour {kid.name}
                    </button>
                  )}
                  {!isStage1 && manuallyUnlocked && (
                    <button onClick={() => onToggleManualUnlock(kid.id, lvl.id, false)}
                      className="w-full mb-3 px-3 py-2 rounded-lg bg-stone-100 text-stone-700 text-sm hover:bg-stone-200 transition-all">
                      🔒 Retirer le déblocage forcé pour {kid.name}
                    </button>
                  )}
                  <div className="text-[10px] uppercase tracking-widest text-stone-500 mb-2">
                    Cahiers de {kid.name} · touche pour basculer fait/non-fait
                  </div>
                  <div className="grid grid-cols-5 sm:grid-cols-10 gap-2">
                    {Array.from({ length: BOOKLETS_PER_LEVEL }, (_, i) => i + 1).map(bookletNum => {
                      const bDone = lp.completedBooklets.includes(bookletNum);
                      const label = getBookletLabel(lvl.id, bookletNum);
                      return (
                        <button key={bookletNum}
                          onClick={() => {
                            const newList = bDone
                              ? lp.completedBooklets.filter(n => n !== bookletNum)
                              : [...lp.completedBooklets, bookletNum];
                            onSetCompletedBooklets(kid.id, lvl.id, newList);
                          }}
                          className={`aspect-square rounded-lg font-kumon text-xs tabular-nums transition-all active:scale-95 flex flex-col items-center justify-center ${
                            bDone
                              ? 'bg-emerald-100 text-emerald-800 border-2 border-emerald-300 hover:bg-emerald-200'
                              : 'bg-stone-100 text-stone-700 border-2 border-stone-200 hover:bg-stone-200'
                          }`}>
                          <span>{bookletNum}</span>
                          {label && <span className="text-[8px] opacity-70 leading-none mt-0.5">{label}</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="pt-2">
        <button onClick={() => {
          if (confirm(`Réinitialiser TOUTE la progression de ${kid.name} ?`)) {
            onResetProgress(kid.id);
          }
        }}
          className="text-xs text-rose-700 hover:text-rose-900 px-3 py-2 rounded-lg hover:bg-rose-50">
          ↻ Réinitialiser toute la progression de {kid.name}
        </button>
      </div>
    </div>
  );
}

function ReviewTab({ config, sessions, onReview }) {
  if (sessions.length === 0) {
    return (
      <div className="mt-4 rounded-2xl border-2 border-dashed border-stone-300 p-12 text-center">
        <div className="text-3xl mb-2">✓</div>
        <div className="text-stone-700">Aucun cahier à corriger</div>
        <div className="text-xs text-stone-500 mt-1">Les cahiers en mode crayon manuel apparaîtront ici</div>
      </div>
    );
  }
  return (
    <div className="mt-4 space-y-2">
      {sessions.map(s => {
        const kid = config.kids.find(k => k.id === s.kidId);
        const lvl = levelById(s.levelId);
        const c = kid ? KID_COLORS[kid.color] : KID_COLORS.teal;
        return (
          <button key={s.id} onClick={() => onReview(s)}
            className="w-full bg-white rounded-2xl border-2 border-rose-200 p-4 flex items-center gap-4 hover:shadow-md hover:border-rose-400 transition-all text-left">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center font-display text-lg text-white shrink-0"
              style={{ background: c.ink }}>{kid?.name.charAt(0).toUpperCase()}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="font-medium text-stone-900">{kid?.name}</div>
                <div className="text-xs px-2 py-0.5 rounded-full bg-stone-100 text-stone-700">{lvl?.id} · Cahier {s.bookletNum}</div>
              </div>
              <div className="text-xs text-stone-500 mt-0.5">{fmtDate(s.timestamp)} · {fmtDurLong(s.durationSec)}</div>
            </div>
            <div className="text-xs uppercase tracking-widest text-rose-700 font-bold">Corriger →</div>
          </button>
        );
      })}
    </div>
  );
}

function ReviewModal({ session, kid, onSave, onClose }) {
  const lvl = levelById(session.levelId);
  const [verdicts, setVerdicts] = useState(() => {
    const out = {};
    session.pages.forEach((pg, pi) => {
      pg.problems.forEach((p, qi) => {
        out[`${pi}-${qi}`] = p.firstTryCorrect === null ? null : p.firstTryCorrect;
      });
    });
    return out;
  });

  const setVerdict = (pi, qi, v) => setVerdicts(prev => ({ ...prev, [`${pi}-${qi}`]: v }));
  const allDone = Object.values(verdicts).every(v => v !== null);
  const correctCount = Object.values(verdicts).filter(v => v === true).length;
  const wrongCount = Object.values(verdicts).filter(v => v === false).length;
  const totalRemaining = session.totalProblems - correctCount - wrongCount;

  const finalize = () => {
    const updatedPages = session.pages.map((pg, pi) => ({
      ...pg,
      problems: pg.problems.map((p, qi) => ({
        ...p,
        firstTryCorrect: verdicts[`${pi}-${qi}`],
        finalCorrect: verdicts[`${pi}-${qi}`],
      })),
    }));
    onSave({
      ...session, pages: updatedPages,
      firstTryCorrect: correctCount, score: correctCount, needsReview: false,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-start sm:items-center justify-center p-2 sm:p-4 overflow-y-auto"
      onClick={onClose}>
      <div className="rounded-3xl max-w-5xl w-full p-5 sm:p-7 shadow-2xl max-h-[95vh] overflow-y-auto"
        onClick={e => e.stopPropagation()} style={{ background: 'var(--paper)' }}>
        <div className="flex items-start justify-between sticky top-0 pb-3 -mt-1" style={{ background: 'var(--paper)' }}>
          <div>
            <div className="text-xs uppercase tracking-widest text-stone-500">Correction · {kid?.name}</div>
            <div className="font-display text-2xl text-stone-900 mt-0.5">{lvl?.id} · Cahier {session.bookletNum}</div>
            <div className="text-xs text-stone-500 mt-0.5">{fmtDate(session.timestamp)}</div>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-900 text-2xl px-2">×</button>
        </div>

        <div className="mt-2 flex items-center gap-4 text-sm flex-wrap">
          <div className="flex items-center gap-1.5 text-emerald-700">
            <span className="font-display text-xl">{correctCount}</span> <span>correctes</span>
          </div>
          <div className="flex items-center gap-1.5 text-rose-700">
            <span className="font-display text-xl">{wrongCount}</span> <span>erreurs</span>
          </div>
          <div className="text-stone-500">
            <span className="font-display text-xl">{totalRemaining}</span> restantes
          </div>
        </div>

        <div className="mt-5 space-y-5">
          {session.pages.map((pg, pi) => (
            <div key={pi}>
              <div className="font-kumon text-sm text-stone-500 mb-2 tabular-nums">
                {pg.ref.trim()}{pg.isWordPage ? ' · Mot problème' : ''}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {pg.problems.map((p, qi) => {
                  const key = `${pi}-${qi}`;
                  const v = verdicts[key];
                  return (
                    <div key={qi} className="bg-white rounded-xl border-2 p-2.5"
                      style={{ borderColor: v === true ? '#047857' : v === false ? '#be123c' : '#e7e5e4' }}>
                      <div className="flex items-center gap-2">
                        <div className="font-kumon text-base tabular-nums text-stone-900 flex-1 leading-tight">
                          {p.wordText ? p.wordText : `${p.a} ${p.op} ${p.b} =`}
                        </div>
                        <div className="text-xs text-stone-400 shrink-0">({p.answer})</div>
                      </div>
                      {p.drawing && (
                        <div className="mt-1.5 rounded-lg overflow-hidden border border-stone-200">
                          <img src={p.drawing} alt="" className="w-full block" style={{ background: '#faf6ee' }} />
                        </div>
                      )}
                      <div className="mt-2 grid grid-cols-2 gap-1.5">
                        <button onClick={() => setVerdict(pi, qi, true)}
                          className={`py-1.5 rounded-lg font-medium text-xs transition-all ${v === true ? 'bg-emerald-700 text-white' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}>✓</button>
                        <button onClick={() => setVerdict(pi, qi, false)}
                          className={`py-1.5 rounded-lg font-medium text-xs transition-all ${v === false ? 'bg-rose-700 text-white' : 'bg-rose-50 text-rose-700 hover:bg-rose-100'}`}>✗</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 flex items-center justify-between gap-3 sticky bottom-0 pt-3 border-t border-stone-200 flex-wrap" style={{ background: 'var(--paper)' }}>
          <div className="text-sm text-stone-600">
            {allDone ? `Score final : ${correctCount}/${session.totalProblems}` : 'Corrige toutes les réponses pour finaliser'}
          </div>
          <div className="flex gap-2">
            <Btn variant="soft" onClick={onClose}>Plus tard</Btn>
            <Btn onClick={finalize} disabled={!allDone}>Finaliser</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

function SessionsTab({ config, sessions, onSelect, onDelete }) {
  const [filter, setFilter] = useState('all');
  const visibleKids = config.kids.filter(k => k.name?.trim());
  const filtered = filter === 'all' ? sessions : sessions.filter(s => s.kidId === filter);

  return (
    <div className="mt-4">
      <div className="flex gap-2 mb-4 flex-wrap">
        <button onClick={() => setFilter('all')}
          className={`px-3 py-1.5 rounded-full text-xs ${filter === 'all' ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-700 hover:bg-stone-200'}`}>
          Tous
        </button>
        {visibleKids.map(kid => (
          <button key={kid.id} onClick={() => setFilter(kid.id)}
            className={`px-3 py-1.5 rounded-full text-xs ${filter === kid.id ? 'text-white' : 'bg-stone-100 text-stone-700 hover:bg-stone-200'}`}
            style={filter === kid.id ? { background: KID_COLORS[kid.color]?.ink } : {}}>
            {kid.name}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-stone-300 p-12 text-center text-stone-500 text-sm">
          Aucun cahier pour l'instant
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(s => {
            const kid = config.kids.find(k => k.id === s.kidId);
            const lvl = levelById(s.levelId);
            const c = kid ? (KID_COLORS[kid.color] || KID_COLORS.teal) : KID_COLORS.teal;
            const info = lvl ? CAT_INFO[lvl.cat] : null;
            const pct = s.needsReview ? null : Math.round(s.firstTryCorrect / s.totalProblems * 100);
            return (
              <div key={s.id} className="bg-white rounded-2xl border-2 border-stone-200 p-4 flex items-center gap-4 hover:shadow-md transition-all">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center font-display text-lg text-white shrink-0"
                  style={{ background: c.ink }}>{kid?.name.charAt(0).toUpperCase()}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="font-medium text-stone-900">{kid?.name}</div>
                    {info && <div className="text-xs px-2 py-0.5 rounded-full" style={{ background: info.soft, color: info.accent }}>{lvl.id} · Cahier {s.bookletNum}</div>}
                    {s.needsReview && <div className="text-xs px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">À corriger</div>}
                  </div>
                  <div className="text-xs text-stone-500 mt-0.5">{fmtDate(s.timestamp)} · ⏱ {fmtDurLong(s.durationSec)}</div>
                </div>
                <div className="text-right shrink-0">
                  {s.needsReview ? (
                    <div className="font-display text-lg text-rose-700">—</div>
                  ) : (
                    <>
                      <div className="font-display text-2xl tabular-nums" style={{ color: pct >= 80 ? '#047857' : pct >= 50 ? '#b45309' : '#be123c' }}>
                        {s.firstTryCorrect}<span className="text-sm opacity-50">/{s.totalProblems}</span>
                      </div>
                      <div className="text-[10px] text-stone-500 tabular-nums">{pct}%</div>
                    </>
                  )}
                </div>
                <button onClick={() => onSelect(s)} className="px-3 py-1.5 text-xs rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700">Voir</button>
                <button onClick={() => { if (confirm('Supprimer ce cahier ?')) onDelete(s.id); }}
                  className="text-stone-400 hover:text-rose-700 p-1.5 text-sm">×</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SessionDetailModal({ session, kid, parentEmail, onClose }) {
  const lvl = levelById(session.levelId);
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}>
      <div className="rounded-3xl max-w-4xl w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()} style={{ background: 'var(--paper)' }}>
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs uppercase tracking-widest text-stone-500">{kid?.name} · {lvl?.id} · Cahier {session.bookletNum}</div>
            <div className="font-display text-2xl text-stone-900 mt-1">{fmtDate(session.timestamp)}</div>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-900 text-xl">×</button>
        </div>
        <div className="mt-4 flex gap-6 text-sm flex-wrap">
          {!session.needsReview && <div>Score : <span className="font-display text-xl">{session.firstTryCorrect}/{session.totalProblems}</span></div>}
          <div>⏱ <span className="font-mono">{fmtDurLong(session.durationSec)}</span></div>
          {(session.correctionDurationSec ?? 0) > 0 && (
            <div className="text-stone-500 text-xs">
              1er essai : {fmtDur(session.firstTryDurationSec ?? 0)} · Correction : {fmtDur(session.correctionDurationSec)}
            </div>
          )}
          {session.pausedSec > 0 && <div className="text-stone-500">Pauses : {fmtDurLong(session.pausedSec)}</div>}
          <div>Mode : <span className="font-medium">{INPUT_MODES[session.mode || 'keypad']?.label}</span></div>
        </div>
        <div className="mt-5 space-y-4">
          {session.pages.map((pg, pi) => (
            <div key={pi}>
              <div className="font-kumon text-xs text-stone-500 mb-1.5 tabular-nums">
                {pg.ref.trim()}{pg.isWordPage ? ' · Mot problème' : ''}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                {pg.problems.map((p, qi) => (
                  <div key={qi} className="bg-white rounded-lg border p-2"
                    style={{ borderColor: p.firstTryCorrect ? '#a7f3d0' : p.firstTryCorrect === false ? '#fecaca' : '#e7e5e4' }}>
                    <div className="text-xs font-kumon tabular-nums flex items-center gap-1">
                      <span className="flex-1 truncate">{p.wordText ? p.wordText.slice(0, 30) + '…' : `${p.a}${p.op}${p.b}`}={p.firstTryAnswer ?? '?'}</span>
                      <span>{p.firstTryCorrect === true ? '✓' : p.firstTryCorrect === false ? '✗' : '·'}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-6 flex justify-end gap-2 flex-wrap">
          <a href={buildMailto(session, kid, parentEmail)}
            className="px-4 py-2 rounded-xl bg-stone-900 text-white text-sm hover:bg-stone-800 transition-all">
            ✉ Envoyer par courriel
          </a>
          <Btn variant="soft" onClick={onClose}>Fermer</Btn>
        </div>
      </div>
    </div>
  );
}

function SettingsTab({ config, onUpdate }) {
  const [draft, setDraft] = useState(config);
  const [savedFlash, setSavedFlash] = useState(false);

  const save = () => {
    onUpdate(draft);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1500);
  };

  const updateKid = (idx, field, value) => {
    const kids = [...draft.kids];
    kids[idx] = { ...kids[idx], [field]: value };
    setDraft({ ...draft, kids });
  };

  const baseUrl = typeof window !== 'undefined' ? window.location.origin + window.location.pathname : '';

  return (
    <div className="mt-4 space-y-6">
      <div className="bg-white rounded-2xl border-2 border-stone-200 p-6">
        <div className="font-display text-lg text-stone-900 mb-4">Enfants</div>
        <div className="space-y-4">
          {draft.kids.map((kid, idx) => {
            const c = KID_COLORS[kid.color] || KID_COLORS.teal;
            return (
              <div key={kid.id} className="border-2 rounded-xl p-4"
                style={{ borderColor: c.ink + '40' }}>
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <div className="text-xs uppercase tracking-widest text-stone-500">
                    {idx === 0 ? '1er enfant' : idx === 1 ? '2e enfant' : '3e enfant'}
                  </div>
                </div>
                <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <label className="block">
                        <div className="text-[10px] uppercase tracking-widest text-stone-500 mb-1">Prénom</div>
                        <input type="text" value={kid.name}
                          onChange={e => updateKid(idx, 'name', e.target.value)}
                          placeholder={idx === 2 ? 'Nom du 3e enfant' : ''}
                          className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm" />
                      </label>
                      <label className="block">
                        <div className="text-[10px] uppercase tracking-widest text-stone-500 mb-1">Âge</div>
                        <input type="number" min="3" max="18" value={kid.age || ''}
                          onChange={e => updateKid(idx, 'age', parseInt(e.target.value, 10) || 0)}
                          className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm" />
                      </label>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                      <label className="block">
                        <div className="text-[10px] uppercase tracking-widest text-stone-500 mb-1">Couleur</div>
                        <select value={kid.color} onChange={e => updateKid(idx, 'color', e.target.value)}
                          className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm bg-white">
                          {Object.keys(KID_COLORS).map(k => <option key={k} value={k}>{k}</option>)}
                        </select>
                      </label>
                      <label className="block">
                        <div className="text-[10px] uppercase tracking-widest text-stone-500 mb-1">Code enfant (4 chiffres)</div>
                        <input type="text" maxLength="4" value={kid.pin || ''}
                          onChange={e => updateKid(idx, 'pin', e.target.value.replace(/\D/g, '').slice(0, 4))}
                          className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm font-mono" />
                      </label>
                    </div>
                    <div className="mt-3">
                      <div className="text-[10px] uppercase tracking-widest text-stone-500 mb-2">Mode d'entrée</div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        {Object.entries(INPUT_MODES).map(([id, info]) => (
                          <button key={id} onClick={() => updateKid(idx, 'inputMode', id)}
                            className={`text-left p-3 rounded-xl border-2 transition-all ${kid.inputMode === id ? '' : 'border-stone-200 hover:border-stone-300'}`}
                            style={kid.inputMode === id ? { borderColor: c.ink, background: c.soft } : {}}>
                            <div className="font-medium text-sm text-stone-900">{info.label}</div>
                            <div className="text-xs text-stone-600 mt-0.5">{info.desc}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-white rounded-2xl border-2 border-stone-200 p-6">
        <div className="font-display text-lg text-stone-900 mb-2">Verrouiller cet appareil à un enfant</div>
        <div className="text-xs text-stone-600 mb-4">
          Quand activé, cet iPad/navigateur n'affiche QUE le profil choisi. Idéal pour un iPad dédié.
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setDraft({ ...draft, deviceLockedToKid: null })}
            className={`px-3 py-2 rounded-lg text-sm transition-all ${!draft.deviceLockedToKid ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-700 hover:bg-stone-200'}`}>
            Aucun (tous visibles)
          </button>
          {draft.kids.filter(k => k.name?.trim()).map(k => {
            const c = KID_COLORS[k.color] || KID_COLORS.teal;
            const isActive = draft.deviceLockedToKid === k.id;
            return (
              <button key={k.id} onClick={() => setDraft({ ...draft, deviceLockedToKid: k.id })}
                className={`px-3 py-2 rounded-lg text-sm transition-all ${isActive ? 'text-white' : 'bg-stone-100 text-stone-700 hover:bg-stone-200'}`}
                style={isActive ? { background: c.ink } : {}}>
                Verrouiller à {k.name}
              </button>
            );
          })}
        </div>
      </div>

      {baseUrl && (
        <div className="bg-white rounded-2xl border-2 border-stone-200 p-6">
          <div className="font-display text-lg text-stone-900 mb-2">Liens directs par enfant</div>
          <div className="text-xs text-stone-600 mb-4">
            Une fois l'app déployée, chaque enfant peut avoir son propre lien. Sur son iPad, l'enfant ouvre uniquement son URL.
          </div>
          <div className="space-y-2">
            {draft.kids.filter(k => k.name?.trim()).map(k => (
              <div key={k.id} className="flex items-center gap-2 flex-wrap text-sm">
                <div className="w-20 font-medium text-stone-700">{k.name}</div>
                <code className="flex-1 px-2 py-1 bg-stone-100 rounded text-xs text-stone-700 truncate">
                  {baseUrl}?kid={k.id}
                </code>
                <button onClick={() => {
                  try { navigator.clipboard.writeText(`${baseUrl}?kid=${k.id}`); alert('Lien copié'); }
                  catch (e) {}
                }}
                  className="text-xs px-2 py-1 rounded bg-stone-200 hover:bg-stone-300">Copier</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border-2 border-stone-200 p-6">
        <div className="font-display text-lg text-stone-900 mb-4">Parent</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <div className="text-[10px] uppercase tracking-widest text-stone-500 mb-1">Courriel pour recevoir les résultats</div>
            <input type="email" value={draft.parentEmail}
              onChange={e => setDraft({ ...draft, parentEmail: e.target.value })}
              placeholder="ton@courriel.com"
              className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm" />
          </label>
          <label className="block">
            <div className="text-[10px] uppercase tracking-widest text-stone-500 mb-1">NIP parent (4 chiffres)</div>
            <input type="text" maxLength="4" pattern="[0-9]{4}" value={draft.parentPin}
              onChange={e => setDraft({ ...draft, parentPin: e.target.value.replace(/\D/g, '').slice(0, 4) })}
              className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm font-mono" />
          </label>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Btn onClick={save}>Enregistrer les modifications</Btn>
        {savedFlash && <span className="text-sm text-emerald-700">✓ Enregistré</span>}
      </div>
    </div>
  );
}

// ============================================================
// MAIN APP
// ============================================================
export default function App() {
  const [screen, setScreen] = useState('home');
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [sessions, setSessions] = useState([]);
  const [progress, setProgress] = useState({});
  const [manualUnlocks, setManualUnlocks] = useState({});
  const [loading, setLoading] = useState(true);
  const [activeKid, setActiveKid] = useState(null);
  const [activeLevel, setActiveLevel] = useState(null);
  const [activeBooklet, setActiveBooklet] = useState(1);
  const [lastSession, setLastSession] = useState(null);
  const [justUnlockedNext, setJustUnlockedNext] = useState(null);
  const [urlKidId] = useState(getKidFromUrl());

  useEffect(() => {
    (async () => {
      const c = await loadConfig();
      const s = await loadAllSessions();
      const p = await loadProgress();
      const mu = p._manualUnlocks || {};
      const cleanProgress = { ...p };
      delete cleanProgress._manualUnlocks;
      setConfig(c);
      setSessions(s);
      setProgress(cleanProgress);
      setManualUnlocks(mu);
      setLoading(false);
    })();
  }, []);

  const persistProgress = async (newProgress, newUnlocks) => {
    const toSave = { ...newProgress, _manualUnlocks: newUnlocks ?? manualUnlocks };
    await saveProgress(toSave);
  };

  const handleComplete = async (session) => {
    await saveSession(session);
    let unlocked = null;
    if (!session.needsReview) {
      const newProgress = { ...progress };
      if (!newProgress[session.kidId]) newProgress[session.kidId] = {};
      if (!newProgress[session.kidId][session.levelId]) newProgress[session.kidId][session.levelId] = { completedBooklets: [] };
      const lp = newProgress[session.kidId][session.levelId];
      if (!lp.completedBooklets.includes(session.bookletNum)) {
        lp.completedBooklets = [...lp.completedBooklets, session.bookletNum];
        if (lp.completedBooklets.length === BOOKLETS_PER_LEVEL) {
          const lvl = LEVELS.find(l => l.id === session.levelId);
          if (lvl) {
            const next = LEVELS.find(l => l.stage === lvl.stage + 1);
            if (next) unlocked = next;
          }
        }
      }
      await persistProgress(newProgress);
      setProgress(newProgress);
    }
    const fresh = await loadAllSessions();
    setSessions(fresh);
    setLastSession(session);
    setJustUnlockedNext(unlocked);
    setScreen('results');
  };

  const handleDeleteSession = async (id) => {
    await deleteSession(id);
    const fresh = await loadAllSessions();
    setSessions(fresh);
  };

  const handleUpdateSession = async (s) => {
    await saveSession(s);
    if (!s.needsReview) {
      const newProgress = { ...progress };
      if (!newProgress[s.kidId]) newProgress[s.kidId] = {};
      if (!newProgress[s.kidId][s.levelId]) newProgress[s.kidId][s.levelId] = { completedBooklets: [] };
      const lp = newProgress[s.kidId][s.levelId];
      if (!lp.completedBooklets.includes(s.bookletNum)) {
        lp.completedBooklets = [...lp.completedBooklets, s.bookletNum];
        await persistProgress(newProgress);
        setProgress(newProgress);
      }
    }
    const fresh = await loadAllSessions();
    setSessions(fresh);
  };

  const handleUpdateConfig = async (newConfig) => {
    await saveConfig(newConfig);
    setConfig(newConfig);
    if (activeKid) {
      const updated = newConfig.kids.find(k => k.id === activeKid.id);
      if (updated) setActiveKid(updated);
    }
  };

  const handleResetProgress = async (kidId) => {
    const newProgress = { ...progress };
    delete newProgress[kidId];
    const newUnlocks = { ...manualUnlocks };
    delete newUnlocks[kidId];
    await persistProgress(newProgress, newUnlocks);
    setProgress(newProgress);
    setManualUnlocks(newUnlocks);
  };

  const handleToggleManualUnlock = async (kidId, levelId, enable) => {
    const newUnlocks = { ...manualUnlocks };
    if (!newUnlocks[kidId]) newUnlocks[kidId] = [];
    if (enable) {
      if (!newUnlocks[kidId].includes(levelId)) newUnlocks[kidId] = [...newUnlocks[kidId], levelId];
    } else {
      newUnlocks[kidId] = newUnlocks[kidId].filter(l => l !== levelId);
    }
    await persistProgress(progress, newUnlocks);
    setManualUnlocks(newUnlocks);
  };

  const handleSetCompletedBooklets = async (kidId, levelId, newList) => {
    const newProgress = { ...progress };
    if (!newProgress[kidId]) newProgress[kidId] = {};
    newProgress[kidId][levelId] = { completedBooklets: [...newList].sort((a, b) => a - b) };
    await persistProgress(newProgress);
    setProgress(newProgress);
  };

  const handleContinue = () => {
    if (!lastSession) { setScreen('home'); return; }
    const lvl = LEVELS.find(l => l.id === lastSession.levelId);
    const status = getLevelStatus(activeKid.id, lvl.id, progress, manualUnlocks);
    if (status === 'completed' && justUnlockedNext) {
      setActiveLevel(justUnlockedNext);
      setActiveBooklet(1);
      setScreen('booklet');
    } else {
      const next = getNextBooklet(activeKid.id, lvl.id, progress);
      setActiveLevel(lvl);
      setActiveBooklet(next);
      setScreen('booklet');
    }
  };

  if (loading) {
    return (
      <Paper>
        <div className="min-h-screen flex items-center justify-center">
          <div className="font-display text-2xl text-stone-500 animate-pulse">Chargement…</div>
        </div>
      </Paper>
    );
  }

  const lockedKidId = urlKidId || config.deviceLockedToKid || null;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700;9..144,800&family=Geist:wght@400;500;600&family=Patrick+Hand&display=swap');
        :root { --paper: #faf6ee; --ink: #1c1917; }
        body { background: var(--paper); }
        .font-display { font-family: 'Fraunces', Georgia, serif; font-feature-settings: 'ss01'; letter-spacing: -0.01em; }
        .font-kumon { font-family: 'Patrick Hand', 'Comic Sans MS', cursive; letter-spacing: 0.02em; }
        body, button, input, select { font-family: 'Geist', system-ui, sans-serif; }
        .tabular-nums { font-variant-numeric: tabular-nums; }
        @keyframes shake { 0%,100% { transform: translateX(0); } 25% { transform: translateX(-6px); } 75% { transform: translateX(6px); } }
        .animate-shake { animation: shake 0.4s ease-in-out; }
        body::before {
          content: ''; position: fixed; inset: 0;
          background-image: radial-gradient(circle at 1px 1px, rgba(0,0,0,0.025) 1px, transparent 0);
          background-size: 24px 24px; pointer-events: none; z-index: 0;
        }
      `}</style>

      {screen === 'home' && (
        <KidPicker config={config} sessions={sessions} progress={progress} manualUnlocks={manualUnlocks}
          lockedKidId={lockedKidId}
          onPickKid={k => { setActiveKid(k); setScreen('kidpin'); }}
          onPickParent={() => setScreen('parentgate')} />
      )}
      {screen === 'kidpin' && activeKid && (
        <KidPinGate kid={activeKid}
          onSuccess={() => setScreen('levelpath')}
          onBack={() => { setActiveKid(null); setScreen('home'); }} />
      )}
      {screen === 'levelpath' && activeKid && (
        <LevelPath kid={activeKid} progress={progress} manualUnlocks={manualUnlocks} sessions={sessions}
          onPickBooklet={(lvl, num) => { setActiveLevel(lvl); setActiveBooklet(num); setScreen('booklet'); }}
          onBack={() => setScreen('home')} />
      )}
      {screen === 'booklet' && activeKid && activeLevel && (
        <Booklet kid={activeKid} level={activeLevel} bookletNum={activeBooklet}
          onComplete={handleComplete}
          onAbort={() => setScreen('levelpath')} />
      )}
      {screen === 'results' && lastSession && activeKid && (
        <Results session={lastSession} kid={activeKid} parentEmail={config.parentEmail}
          justUnlockedNext={justUnlockedNext}
          onRetry={() => setScreen('booklet')}
          onContinue={handleContinue}
          onDone={() => setScreen('home')} />
      )}
      {screen === 'parentgate' && (
        <ParentGate pin={config.parentPin}
          onSuccess={() => setScreen('parentdash')}
          onBack={() => setScreen('home')} />
      )}
      {screen === 'parentdash' && (
        <ParentDashboard config={config} sessions={sessions} progress={progress} manualUnlocks={manualUnlocks}
          onUpdateConfig={handleUpdateConfig}
          onDeleteSession={handleDeleteSession}
          onUpdateSession={handleUpdateSession}
          onResetProgress={handleResetProgress}
          onToggleManualUnlock={handleToggleManualUnlock}
          onSetCompletedBooklets={handleSetCompletedBooklets}
          onBack={() => setScreen('home')} />
      )}
    </>
  );
}
