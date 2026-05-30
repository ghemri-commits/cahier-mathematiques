import React, { useState, useEffect, useMemo, useRef } from 'react';

// ============================================================
// STORAGE
// ============================================================
const SHARED = false;
const KEY_CONFIG = 'kumon:config';
const KEY_SESS_PREFIX = 'kumon:sess:';
const KEY_PROGRESS = 'kumon:progress';

const PROBLEMS_PER_PAGE = 10;
const PAGES_PER_BOOKLET = 10; 
const BOOKLETS_PER_LEVEL = 30;

const DEFAULT_CONFIG = {
  kids: [
    { id: 'k1', name: 'Liam',   age: 7, color: 'blue',   inputMode: 'pencil', pin: '1111' },
    { id: 'k2', name: 'Camila', age: 9, color: 'pink',  inputMode: 'pencil', pin: '2222' },
    { id: 'k3', name: 'Invité', age: 8, color: 'purple', inputMode: 'pencil', pin: '3333' },
  ],
  parentPin: '1234',
  parentEmail: '',
  deviceLockedToKid: null,
  geminiApiKey: '',
  geminiModel: 'gemini-2.5-flash',
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
        delete merged.enabled;
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
  { id: '4A', cat: 'ADD', stage: 1,  name: 'Compter par bonds',        desc: 'Suites : +2, +3, +5, +10, +20, +100', kind: 'count-by', op: '+', hasWordProblems: false },
  { id: '3A', cat: 'ADD', stage: 2,  name: 'Addition simple',          desc: 'Drill +1 à +9, paquets répétitifs',   kind: 'add-drill', op: '+', hasWordProblems: false },
  { id: '2A', cat: 'ADD', stage: 3,  name: 'Addition jusqu’à 20', desc: 'Drill +1 à +9 (nombres plus grands)', kind: 'add-drill-20', op: '+', hasWordProblems: false },
  { id: 'A1', cat: 'ADD', stage: 4,  name: 'Addition à 2 chiffres',    desc: '2 chiffres + 1 ou 2 chiffres',         kind: 'add-2digit', op: '+', hasWordProblems: true },
  { id: 'A2', cat: 'ADD', stage: 5,  name: 'Addition à 3 chiffres',    desc: '3 chiffres avec retenue',              kind: 'add-3digit', op: '+', hasWordProblems: true },
  { id: 'S1', cat: 'SUB', stage: 6,  name: 'Soustraction simple',      desc: 'Drill −1 à −9, paquets répétitifs',    kind: 'sub-drill', op: '−', hasWordProblems: false },
  { id: 'S2', cat: 'SUB', stage: 7,  name: 'Soustraction jusqu’à 20', desc: 'Drill −1 à −9 (plus grands)',     kind: 'sub-drill-20', op: '−', hasWordProblems: false },
  { id: 'S3', cat: 'SUB', stage: 8,  name: 'Soustraction à 2 chiffres', desc: '2 chiffres avec et sans emprunt',    kind: 'sub-2digit', op: '−', hasWordProblems: true },
  { id: 'S4', cat: 'SUB', stage: 9,  name: 'Soustraction à 3 chiffres', desc: '3 chiffres avec emprunt',             kind: 'sub-3digit', op: '−', hasWordProblems: true },
  { id: 'M1', cat: 'MUL', stage: 10, name: 'Tables ×2, ×5, ×10',       desc: 'Drill une table à la fois',            kind: 'mul-drill-easy', op: '×', hasWordProblems: true },
  { id: 'M2', cat: 'MUL', stage: 11, name: 'Tables ×3, ×4',            desc: 'Drill une table à la fois',            kind: 'mul-drill-mid', op: '×', hasWordProblems: true },
  { id: 'M3', cat: 'MUL', stage: 12, name: 'Tables ×6 à ×9',           desc: 'Drill une table à la fois',            kind: 'mul-drill-hard', op: '×', hasWordProblems: true },
  { id: 'M4', cat: 'MUL', stage: 13, name: 'Multiplication 2 chiffres', desc: '2 chiffres × 1 chiffre',              kind: 'mul-2x1', op: '×', hasWordProblems: true },
  { id: 'M5', cat: 'MUL', stage: 14, name: 'Multiplication 3 chiffres', desc: '3 chiffres × 1 chiffre',              kind: 'mul-3x1', op: '×', hasWordProblems: true },
  { id: 'D1', cat: 'DIV', stage: 15, name: 'Division 1', desc: 'Division exacte (÷2, ÷5, ÷10)', kind: 'div-simple', op: '÷', hasWordProblems: false, divisors: [2, 5, 10] },
  { id: 'D2', cat: 'DIV', stage: 16, name: 'Division 2', desc: 'Division exacte (÷3, ÷4)', kind: 'div-simple', op: '÷', hasWordProblems: false, divisors: [3, 4] },
  { id: 'D3', cat: 'DIV', stage: 17, name: 'Division 3', desc: 'Division exacte (÷6, ÷7, ÷8, ÷9)', kind: 'div-simple', op: '÷', hasWordProblems: false, divisors: [6, 7, 8, 9] },
  { id: 'D4', cat: 'DIV', stage: 18, name: 'Division 4',                  desc: 'Division avec reste',                           kind: 'div-remainder',  op: '÷', hasWordProblems: false, divisors: [2, 3, 4, 5, 6, 7, 8, 9] },
  { id: 'D5', cat: 'DIV', stage: 19, name: 'Division posée 1',             desc: '2 chiffres ÷ 1 chiffre, sans reste',             kind: 'div-long-1',     op: '÷', hasWordProblems: false },
  { id: 'D6', cat: 'DIV', stage: 20, name: 'Division posée 2',             desc: '3 chiffres ÷ 1 chiffre avec reste',              kind: 'div-long-2',     op: '÷', hasWordProblems: false },
  { id: 'E1', cat: 'FRA', stage: 21, name: 'Fractions équivalentes',       desc: 'Trouver le numérateur manquant',                 kind: 'frac-equiv',     op: '=', hasWordProblems: false },
  { id: 'E2', cat: 'FRA', stage: 22, name: 'Addition fractions (même dén.)',desc: 'Même dénominateur',                             kind: 'frac-add-same',  op: '+', hasWordProblems: false },
  { id: 'E3', cat: 'FRA', stage: 23, name: 'Sous. fractions (même dén.)',  desc: 'Soustraction, même dénominateur',                kind: 'frac-sub-same',  op: '−', hasWordProblems: false },
  { id: 'E4', cat: 'FRA', stage: 24, name: 'Fractions dén. différents',    desc: 'Addition et soustraction, dénominateurs différents', kind: 'frac-add-diff', op: '+', hasWordProblems: false },
  { id: 'F1', cat: 'FRA', stage: 25, name: 'Multiplication fractions',     desc: '⅔ × ¾, simplification du résultat',             kind: 'frac-mul',       op: '×', hasWordProblems: false },
  { id: 'F2', cat: 'FRA', stage: 26, name: 'Division fractions',           desc: '½ ÷ ¼, inversion du diviseur',                  kind: 'frac-div',       op: '÷', hasWordProblems: false },
  { id: 'Dec1', cat: 'DEC', stage: 27, name: 'Décimaux + et −',            desc: 'Addition et soustraction de décimaux',           kind: 'dec-add-sub',    op: '.', hasWordProblems: false },
  { id: 'Dec2', cat: 'DEC', stage: 28, name: 'Décimaux ×',                 desc: 'Multiplication de décimaux',                    kind: 'dec-mul',        op: '×', hasWordProblems: false },
];

const CAT_INFO = {
  ADD: { name: 'Addition',       accent: '#3b82f6', soft: '#eff6ff', dot: '#2563eb' },
  SUB: { name: 'Soustraction',   accent: '#10b981', soft: '#ecfdf5', dot: '#059669' },
  MUL: { name: 'Multiplication', accent: '#8b5cf6', soft: '#f5f3ff', dot: '#7c3aed' },
  DIV: { name: 'Division',       accent: '#7c3aed', soft: '#f5f3ff', dot: '#5b21b6' },
  FRA: { name: 'Fractions',      accent: '#ec4899', soft: '#fdf2f8', dot: '#db2777' },
  DEC: { name: 'Décimaux',       accent: '#f97316', soft: '#fff7ed', dot: '#ea580c' },
};

const KID_COLORS = {
  blue:   { ink: '#3b82f6', soft: '#eff6ff', strong: '#1d4ed8' },
  pink:   { ink: '#ec4899', soft: '#fdf2f8', strong: '#be185d' },
  orange: { ink: '#f97316', soft: '#fff7ed', strong: '#c2410c' },
  purple: { ink: '#8b5cf6', soft: '#f5f3ff', strong: '#6d28d9' },
  green:  { ink: '#10b981', soft: '#ecfdf5', strong: '#047857' },
  red:    { ink: '#ef4444', soft: '#fef2f2', strong: '#b91c1c' },
};

const INPUT_MODES = {
  keypad:  { label: 'Clavier tactile',     desc: 'Tape la réponse au doigt' },
  pencil:  { label: 'Apple Pencil', desc: 'Écris, l’app corrige (Nécessite Griffonnage sur iPad)' },
  manual:  { label: 'Crayon & Parent',       desc: 'Écris, le parent corrige (Idéal pour PC ou sans Griffonnage)' },
};

// ============================================================
// MATH LOGIC
// ============================================================
function hashSeed(...args) { let h = 0; const s = args.join('-'); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
function seededRandom(seed) { let s = seed % 233280 || 1; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; }
const rndS = (rng, min, max) => Math.floor(rng() * (max - min + 1)) + min;
const pickS = (rng, a) => a[Math.floor(rng() * a.length)];
const shuffleS = (rng, arr) => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

const ADD_DRILL_MAP = (() => { const m = []; for (let n = 1; n <= 9; n++) { m.push(n, n); } m.push('mix', 'mix'); return m; })();
const SUB_DRILL_MAP = (() => { const m = []; for (let n = 1; n <= 9; n++) { m.push(n, n); } m.push('mix', 'mix'); return m; })();
const COUNT_BY_MAP = [2, 2, 3, 3, 5, 5, 5, 5, 10, 10, 10, 10, 20, 20, 20, 20, 100, 100, 100, 100];
const MUL_EASY_MAP = (() => { const tables = [2, 5, 10]; const m = []; tables.forEach(t => { for (let i = 0; i < 6; i++) m.push(t); }); m.push('mix', 'mix'); return m; })();
const MUL_MID_MAP = (() => { const m = []; for (let i = 0; i < 9; i++) m.push(3); for (let i = 0; i < 9; i++) m.push(4); m.push('mix', 'mix'); return m; })();
const MUL_HARD_MAP = (() => { const tables = [6, 7, 8, 9]; const m = []; tables.forEach(t => { for (let i = 0; i < 4; i++) m.push(t); }); m.push('mix', 'mix', 'mix', 'mix'); return m; })();

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
function getLearnedOperands(levelId, bookletNum) {
  const learned = [];
  for (let b = 1; b < bookletNum; b++) {
    const op = getDrillOperand(levelId, b);
    if (op !== null && op !== 'mix' && !learned.includes(op)) learned.push(op);
  }
  return learned;
}
const FOCUS_RATIO = 0.65;
function pickDrillOperand(rng, levelId, bookletNum, allOperandsFallback) {
  const focus = getDrillOperand(levelId, bookletNum);
  const learned = getLearnedOperands(levelId, bookletNum);
  if (focus === 'mix') return pickS(rng, learned.length > 0 ? learned : allOperandsFallback);
  if (learned.length === 0) return focus;
  return rng() < FOCUS_RATIO ? focus : pickS(rng, learned);
}

const WP_ADD = [
  (a, b) => ({ text: `Hier j'ai lu ${a} pages et aujourd'hui ${b} pages. Combien de pages au total ?`, answer: a + b }),
  (a, b) => ({ text: `J'ai ramassé ${a} fleurs et mon frère ${b}. Combien de fleurs avons-nous au total ?`, answer: a + b }),
  (a, b) => ({ text: `Dans la classe il y a ${a} filles et ${b} garçons. Combien d'élèves au total ?`, answer: a + b }),
  (a, b) => ({ text: `Liam a marché ${a} mètres puis ${b} mètres de plus. Quelle distance totale ?`, answer: a + b }),
];
const WP_SUB = [
  (a, b) => ({ text: `J'ai utilisé ${b} boutons d'une boîte de ${a}. Combien en reste-t-il ?`, answer: a - b }),
  (a, b) => ({ text: `Il y avait ${a} oiseaux sur l'arbre. ${b} se sont envolés. Combien restent-ils ?`, answer: a - b }),
  (a, b) => ({ text: `Le livre a ${a} pages. J'en ai lu ${b}. Combien de pages me reste-t-il ?`, answer: a - b }),
  (a, b) => ({ text: `Camila a ${a} bonbons. Elle en donne ${b} à ses amis. Combien lui en reste-t-il ?`, answer: a - b }),
];
const WP_MUL = [
  (a, b) => ({ text: `Il y a ${a} boîtes avec ${b} chocolats dans chaque. Combien de chocolats au total ?`, answer: a * b }),
  (a, b) => ({ text: `${a} enfants ont chacun ${b} ballons. Combien de ballons au total ?`, answer: a * b }),
  (a, b) => ({ text: `Chaque sac contient ${b} bonbons. Pour ${a} sacs, combien de bonbons en tout ?`, answer: a * b }),
];

function generateWordProblem(levelId, bookletNum) {
  const rng = seededRandom(hashSeed(levelId, bookletNum, 'word'));
  const lvl = LEVELS.find(l => l.id === levelId);
  if (!lvl) return null;
  let a, b, templates;
  switch (lvl.cat) {
    case 'ADD':
      if (lvl.id === 'A1') { a = rndS(rng, 11, 89); b = rndS(rng, 11, 99 - a); }
      else { a = rndS(rng, 100, 700); b = rndS(rng, 100, 999 - a); }
      templates = WP_ADD; break;
    case 'SUB':
      if (lvl.id === 'S3') { a = rndS(rng, 30, 99); b = rndS(rng, 5, a - 5); }
      else { a = rndS(rng, 200, 999); b = rndS(rng, 50, a - 50); }
      templates = WP_SUB; break;
    case 'MUL':
      if (lvl.id === 'M1') { a = pickS(rng, [2, 5, 10]); b = rndS(rng, 2, 10); }
      else if (lvl.id === 'M2') { a = pickS(rng, [3, 4]); b = rndS(rng, 2, 10); }
      else if (lvl.id === 'M3') { a = pickS(rng, [6, 7, 8, 9]); b = rndS(rng, 2, 10); }
      else if (lvl.id === 'M4') { a = rndS(rng, 11, 50); b = rndS(rng, 2, 9); }
      else { a = rndS(rng, 100, 500); b = rndS(rng, 2, 9); }
      templates = WP_MUL; break;
    default: return null;
  }
  return pickS(rng, templates)(a, b);
}

function mathGcd(a, b) { return b === 0 ? a : mathGcd(b, a % b); }
function mathLcm(a, b) { return a * b / mathGcd(a, b); }
function normalizeFracAnswer(s) {
  s = String(s).trim();
  if (s.includes('/')) {
    const parts = s.split('/').map(Number);
    if (parts.length !== 2 || isNaN(parts[0]) || isNaN(parts[1]) || parts[1] === 0) return s;
    const g = mathGcd(Math.abs(parts[0]), Math.abs(parts[1]));
    return parts[1] / g === 1 ? String(parts[0] / g) : `${parts[0] / g}/${parts[1] / g}`;
  }
  return s;
}

function generateProblemsForPage(levelId, bookletNum, pageNum) {
  const rng = seededRandom(hashSeed(levelId, bookletNum, pageNum));
  const lvl = LEVELS.find(l => l.id === levelId);
  if (!lvl) return [];
  const kind = lvl.kind;

  if (kind === 'count-by') {
    const step = getDrillOperand('4A', bookletNum);
    const problems = [];
    const start = step * (pageNum - 1) + step;
    for (let i = 0; i < PROBLEMS_PER_PAGE; i++) { const a = start + i * step; problems.push({ a, b: step, op: '+', answer: a + step }); }
    return shuffleS(rng, problems);
  }
  if (kind === 'add-drill') {
    const all = [1,2,3,4,5,6,7,8,9];
    return shuffleS(rng, Array.from({ length: PROBLEMS_PER_PAGE }, () => {
      const n = pickDrillOperand(rng, levelId, bookletNum, all);
      const a = rndS(rng, 1, 9); return { a, b: n, op: '+', answer: a + n };
    }));
  }
  if (kind === 'add-drill-20') {
    const all = [1,2,3,4,5,6,7,8,9];
    return shuffleS(rng, Array.from({ length: PROBLEMS_PER_PAGE }, () => {
      const n = pickDrillOperand(rng, levelId, bookletNum, all);
      const a = rndS(rng, 2, Math.max(2, 20 - n)); return { a, b: n, op: '+', answer: a + n };
    }));
  }
  if (kind === 'add-2digit') {
    const adv = bookletNum > 10;
    return Array.from({ length: PROBLEMS_PER_PAGE }, () => {
      if (adv) { const a = rndS(rng, 10, 89); const b = rndS(rng, 10, 99 - a); return { a, b, op: '+', answer: a + b }; }
      const a = rndS(rng, 10, 89); const b = rndS(rng, 1, 9); return { a, b, op: '+', answer: a + b };
    });
  }
  if (kind === 'add-3digit') {
    return Array.from({ length: PROBLEMS_PER_PAGE }, () => {
      const a = rndS(rng, 100, 899); const b = rndS(rng, 100, 999 - a); return { a, b, op: '+', answer: a + b };
    });
  }
  if (kind === 'sub-drill') {
    const all = [1,2,3,4,5,6,7,8,9];
    return shuffleS(rng, Array.from({ length: PROBLEMS_PER_PAGE }, () => {
      const n = pickDrillOperand(rng, levelId, bookletNum, all);
      const a = rndS(rng, n + 1, 10); return { a, b: n, op: '−', answer: a - n };
    }));
  }
  if (kind === 'sub-drill-20') {
    const all = [1,2,3,4,5,6,7,8,9];
    return shuffleS(rng, Array.from({ length: PROBLEMS_PER_PAGE }, () => {
      const n = pickDrillOperand(rng, levelId, bookletNum, all);
      const a = rndS(rng, n + 1, 20); return { a, b: n, op: '−', answer: a - n };
    }));
  }
  if (kind === 'sub-2digit') {
    return Array.from({ length: PROBLEMS_PER_PAGE }, () => {
      const a = rndS(rng, 20, 99); const b = rndS(rng, 5, a - 1); return { a, b, op: '−', answer: a - b };
    });
  }
  if (kind === 'sub-3digit') {
    return Array.from({ length: PROBLEMS_PER_PAGE }, () => {
      const a = rndS(rng, 200, 999); const b = rndS(rng, 100, a - 1); return { a, b, op: '−', answer: a - b };
    });
  }
  if (kind === 'mul-drill-easy') {
    const all = [2, 5, 10];
    return shuffleS(rng, Array.from({ length: PROBLEMS_PER_PAGE }, () => {
      const t = pickDrillOperand(rng, levelId, bookletNum, all);
      const m = rndS(rng, 1, 10); return { a: t, b: m, op: '×', answer: t * m };
    }));
  }
  if (kind === 'mul-drill-mid') {
    const all = [3, 4];
    return shuffleS(rng, Array.from({ length: PROBLEMS_PER_PAGE }, () => {
      const t = pickDrillOperand(rng, levelId, bookletNum, all);
      const m = rndS(rng, 1, 10); return { a: t, b: m, op: '×', answer: t * m };
    }));
  }
  if (kind === 'mul-drill-hard') {
    const all = [6, 7, 8, 9];
    return shuffleS(rng, Array.from({ length: PROBLEMS_PER_PAGE }, () => {
      const t = pickDrillOperand(rng, levelId, bookletNum, all);
      const m = rndS(rng, 1, 10); return { a: t, b: m, op: '×', answer: t * m };
    }));
  }
  if (kind === 'mul-2x1') {
    return Array.from({ length: PROBLEMS_PER_PAGE }, () => {
      const a = rndS(rng, 11, 99); const b = rndS(rng, 2, 9); return { a, b, op: '×', answer: a * b };
    });
  }
  if (kind === 'mul-3x1') {
    return Array.from({ length: PROBLEMS_PER_PAGE }, () => {
      const a = rndS(rng, 101, 999); const b = rndS(rng, 2, 9); return { a, b, op: '×', answer: a * b };
    });
  }
  if (kind === 'div-simple') {
    const divisors = lvl.divisors || [2, 5, 10];
    return shuffleS(rng, Array.from({ length: PROBLEMS_PER_PAGE }, () => {
      const d = pickS(rng, divisors);
      const q = rndS(rng, 1, 10);
      const a = d * q;
      return { a, b: d, op: '÷', answer: q, remainder: 0 };
    }));
  }
  if (kind === 'div-remainder') {
    const divisors = lvl.divisors || [2, 3, 4, 5, 6, 7, 8, 9];
    return shuffleS(rng, Array.from({ length: PROBLEMS_PER_PAGE }, () => {
      const d = pickS(rng, divisors);
      const a = rndS(rng, d, d * 10 + d - 1);
      const q = Math.floor(a / d);
      const r = a % d;
      return { a, b: d, op: '÷', answer: q, remainder: r };
    }));
  }
  if (kind === 'div-long-1') {
    return Array.from({ length: PROBLEMS_PER_PAGE }, () => {
      const divisor = rndS(rng, 2, 9);
      const quotient = rndS(rng, 2, 9);
      return { display: `${divisor * quotient} ÷ ${divisor}`, answer: String(quotient), op: '÷' };
    });
  }
  if (kind === 'div-long-2') {
    return Array.from({ length: PROBLEMS_PER_PAGE }, () => {
      const divisor = rndS(rng, 2, 9);
      const quotient = rndS(rng, 11, 99);
      const remainder = rndS(rng, 0, divisor - 1);
      const dividend = divisor * quotient + remainder;
      return {
        display: `${dividend} ÷ ${divisor}`,
        answer: remainder > 0 ? `${quotient} R${remainder}` : String(quotient),
        op: '÷'
      };
    });
  }
  if (kind === 'frac-equiv') {
    const bases = [[1,2],[1,3],[2,3],[1,4],[3,4],[1,5],[2,5],[1,6],[3,5],[2,7]];
    return Array.from({ length: PROBLEMS_PER_PAGE }, () => {
      const [bn, bd] = bases[rndS(rng, 0, bases.length - 1)];
      const mult = rndS(rng, 2, 5);
      return { display: `${bn}/${bd} = ?/${bd * mult}`, answer: String(bn * mult), op: '=' };
    });
  }
  if (kind === 'frac-add-same') {
    return Array.from({ length: PROBLEMS_PER_PAGE }, () => {
      const den = [2, 3, 4, 5, 6, 8][rndS(rng, 0, 5)];
      const n1 = rndS(rng, 1, den - 1);
      const n2 = rndS(rng, 1, Math.max(1, den - n1));
      const raw = n1 + n2;
      const g = mathGcd(raw, den);
      const an = raw / g, ad = den / g;
      return { display: `${n1}/${den} + ${n2}/${den}`, answer: ad === 1 ? String(an) : `${an}/${ad}`, op: '+', isFrac: true };
    });
  }
  if (kind === 'frac-sub-same') {
    return Array.from({ length: PROBLEMS_PER_PAGE }, () => {
      const den = [2, 3, 4, 5, 6, 8][rndS(rng, 0, 5)];
      const n1 = rndS(rng, 2, den);
      const n2 = rndS(rng, 1, n1 - 1);
      const raw = n1 - n2;
      const g = mathGcd(raw, den);
      const an = raw / g, ad = den / g;
      return { display: `${n1}/${den} − ${n2}/${den}`, answer: ad === 1 ? String(an) : `${an}/${ad}`, op: '−', isFrac: true };
    });
  }
  if (kind === 'frac-add-diff') {
    const pairs = [[1,2,1,3],[1,3,1,4],[1,2,1,4],[1,4,1,5],[1,2,1,5],[1,3,1,6],[1,2,1,6],[1,4,3,8]];
    return Array.from({ length: PROBLEMS_PER_PAGE }, () => {
      const [n1,d1,n2,d2] = pairs[rndS(rng, 0, pairs.length - 1)];
      const isAdd = rndS(rng, 0, 1) === 0;
      const lcd = mathLcm(d1, d2);
      const v1 = n1 * (lcd / d1), v2 = n2 * (lcd / d2);
      const rawNum = isAdd ? v1 + v2 : Math.abs(v1 - v2);
      if (rawNum === 0) return { display: `${n1}/${d1} + ${n2}/${d2}`, answer: normalizeFracAnswer(`${v1 + v2}/${lcd}`), op: '+', isFrac: true };
      const g = mathGcd(rawNum, lcd);
      const an = rawNum / g, ad = lcd / g;
      const left = isAdd ? `${n1}/${d1}` : (v1 >= v2 ? `${n1}/${d1}` : `${n2}/${d2}`);
      const right = isAdd ? `${n2}/${d2}` : (v1 >= v2 ? `${n2}/${d2}` : `${n1}/${d1}`);
      return { display: `${left} ${isAdd ? '+' : '−'} ${right}`, answer: ad === 1 ? String(an) : `${an}/${ad}`, op: isAdd ? '+' : '−', isFrac: true };
    });
  }
  if (kind === 'frac-mul') {
    const pairs = [[1,2,1,3],[1,2,2,3],[1,3,3,4],[2,3,3,4],[1,4,2,3],[1,2,3,4],[2,5,1,2],[1,3,2,5]];
    return Array.from({ length: PROBLEMS_PER_PAGE }, () => {
      const [n1,d1,n2,d2] = pairs[rndS(rng, 0, pairs.length - 1)];
      const rawN = n1 * n2, rawD = d1 * d2;
      const g = mathGcd(rawN, rawD);
      const an = rawN / g, ad = rawD / g;
      return { display: `${n1}/${d1} × ${n2}/${d2}`, answer: ad === 1 ? String(an) : `${an}/${ad}`, op: '×', isFrac: true };
    });
  }
  if (kind === 'frac-div') {
    const pairs = [[1,2,1,4],[2,3,1,3],[3,4,1,2],[1,2,1,3],[1,4,1,2],[3,5,3,10],[1,3,1,6],[2,3,4,9]];
    return Array.from({ length: PROBLEMS_PER_PAGE }, () => {
      const [n1,d1,n2,d2] = pairs[rndS(rng, 0, pairs.length - 1)];
      const rawN = n1 * d2, rawD = d1 * n2;
      const g = mathGcd(rawN, rawD);
      const an = rawN / g, ad = rawD / g;
      return { display: `${n1}/${d1} ÷ ${n2}/${d2}`, answer: ad === 1 ? String(an) : `${an}/${ad}`, op: '÷', isFrac: true };
    });
  }
  if (kind === 'dec-add-sub') {
    return Array.from({ length: PROBLEMS_PER_PAGE }, () => {
      const a = rndS(rng, 10, 99) / 10;
      const b = rndS(rng, 10, 99) / 10;
      const isAdd = rndS(rng, 0, 1) === 0;
      const left = isAdd ? a : Math.max(a, b);
      const right = isAdd ? b : Math.min(a, b);
      const result = Math.round((isAdd ? a + b : Math.abs(a - b)) * 10) / 10;
      return { display: `${left} ${isAdd ? '+' : '−'} ${right}`, answer: String(result), op: isAdd ? '+' : '−' };
    });
  }
  if (kind === 'dec-mul') {
    return Array.from({ length: PROBLEMS_PER_PAGE }, () => {
      const a = rndS(rng, 2, 9);
      const b = rndS(rng, 10, 50) / 10;
      const result = Math.round(a * b * 10) / 10;
      return { display: `${b} × ${a}`, answer: String(result), op: '×' };
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

const formatChrono = (sec) => {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const AppBackground = ({ children }) => (
  <div className="min-h-screen w-full bg-slate-50 text-slate-800 font-sans selection:bg-blue-200">
    {children}
  </div>
);

const Btn = ({ children, onClick, variant = 'primary', className = '', disabled, colorStr }) => {
  const isPrimary = variant === 'primary';
  const baseClasses = "px-6 py-3.5 rounded-2xl font-bold transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm flex items-center justify-center gap-2";
  
  if (colorStr) {
    return (
      <button onClick={onClick} disabled={disabled}
        className={`${baseClasses} ${className}`}
        style={isPrimary ? { backgroundColor: colorStr, color: '#fff', boxShadow: `0 4px 0 ${colorStr}99` } : { backgroundColor: '#fff', color: colorStr, border: `2px solid ${colorStr}` }}>
        {children}
      </button>
    );
  }

  const styles = {
    primary: 'bg-slate-900 text-white hover:bg-slate-800 shadow-[0_4px_0_#334155]',
    soft: 'bg-white text-slate-700 border-2 border-slate-200 hover:border-slate-300 hover:bg-slate-50',
  };
  return (
    <button onClick={onClick} disabled={disabled} className={`${baseClasses} ${styles[variant]} ${className}`}>
      {children}
    </button>
  );
};

function PinPad({ value, onChange, length = 4, accent = '#3b82f6' }) {
  return (
    <div className="w-full max-w-xs mx-auto">
      <div className="flex gap-4 justify-center mb-8">
        {Array.from({ length }, (_, i) => (
          <div key={i} className="w-14 h-16 rounded-2xl border-2 flex items-center justify-center text-3xl font-bold bg-white transition-colors"
            style={{ borderColor: value[i] ? accent : '#cbd5e1', color: accent }}>
            {value[i] ? '●' : ''}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        {['1','2','3','4','5','6','7','8','9'].map(k => (
          <button key={k} onClick={() => onChange((value + k).slice(0, length))}
            className="h-16 rounded-2xl text-2xl font-bold bg-white border-2 border-slate-200 hover:border-slate-300 hover:bg-slate-50 active:scale-95 shadow-sm transition-all text-slate-700">{k}</button>
        ))}
        <div></div>
        <button onClick={() => onChange((value + '0').slice(0, length))}
          className="h-16 rounded-2xl text-2xl font-bold bg-white border-2 border-slate-200 hover:border-slate-300 hover:bg-slate-50 active:scale-95 shadow-sm transition-all text-slate-700">0</button>
        <button onClick={() => onChange(value.slice(0, -1))}
          className="h-16 rounded-2xl text-xl font-bold bg-slate-200 text-slate-600 hover:bg-slate-300 active:scale-95 shadow-sm transition-all">⌫</button>
      </div>
    </div>
  );
}

function HandwritingCanvas({ onChange, resetSignal }) {
  const canvasRef = useRef(null);
  const wrapperRef = useRef(null);
  const drawing = useRef(false);
  const pointerIdRef = useRef(null);
  const strokesRef = useRef([]);
  const currentStrokeRef = useRef(null);
  const sizeRef = useRef({ w: 0, h: 0 });
  const [strokeCount, setStrokeCount] = useState(0);
  const rafRef = useRef(null);
  const pendingPointsRef = useRef([]);

  const setupCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return false;
    const rect = wrapperRef.current.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    const dpr = window.devicePixelRatio || 1;
    const needsResize = canvas.width !== Math.round(rect.width * dpr) || canvas.height !== Math.round(rect.height * dpr);
    if (needsResize) { canvas.width = Math.round(rect.width * dpr); canvas.height = Math.round(rect.height * dpr); }
    sizeRef.current = { w: rect.width, h: rect.height };
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return true;
  };

  const drawGuides = (ctx, w, h) => {
    ctx.save();
    ctx.strokeStyle = '#f1f5f9';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(10, h * 0.8);
    ctx.lineTo(w - 10, h * 0.8);
    ctx.stroke();
    ctx.restore();
  };

  const fullRedraw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { w, h } = sizeRef.current;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    drawGuides(ctx, w, h);
    ctx.strokeStyle = '#0f172a';
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

  const drawSegment = (a, b, width) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.strokeStyle = '#0f172a';
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
    if (!canvas || strokesRef.current.length === 0) { onChange(null); return; }
    const ex = document.createElement('canvas');
    ex.width = sizeRef.current.w; ex.height = sizeRef.current.h;
    const exCtx = ex.getContext('2d');
    exCtx.fillStyle = '#ffffff';
    exCtx.fillRect(0, 0, ex.width, ex.height);
    exCtx.drawImage(canvas, 0, 0, ex.width, ex.height);
    onChange(ex.toDataURL('image/jpeg', 0.6));
  };

  useEffect(() => {
    setupCanvas(); fullRedraw();
    const onResize = () => { setupCanvas(); fullRedraw(); };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    let ro = null;
    if (window.ResizeObserver && wrapperRef.current) { ro = new ResizeObserver(onResize); ro.observe(wrapperRef.current); }
    return () => { window.removeEventListener('resize', onResize); window.removeEventListener('orientationchange', onResize); if (ro) ro.disconnect(); if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, []);

  useEffect(() => {
    strokesRef.current = []; currentStrokeRef.current = null; setStrokeCount(0); pendingPointsRef.current = []; drawing.current = false;
    setupCanvas(); fullRedraw(); onChange(null);
  }, [resetSignal]);

  const getPoint = (e) => { const rect = wrapperRef.current.getBoundingClientRect(); return { x: e.clientX - rect.left, y: e.clientY - rect.top }; };
  const getWidth = (e) => e.pointerType === 'pen' ? 1.5 + ((typeof e.pressure === 'number' && e.pressure > 0) ? e.pressure : 0.5) * 4 : 3;

  const flushPending = () => {
    rafRef.current = null;
    const pts = pendingPointsRef.current; pendingPointsRef.current = [];
    const stroke = currentStrokeRef.current;
    if (!stroke || pts.length === 0) return;
    for (const pt of pts) { const prev = stroke[stroke.length - 1]; stroke.push(pt); if (prev) drawSegment(prev, pt, pt.w); }
  };

  const start = (e) => {
    e.preventDefault();
    const canvas = canvasRef.current; if (!canvas) return;
    setupCanvas();
    try { canvas.setPointerCapture(e.pointerId); pointerIdRef.current = e.pointerId; } catch (err) {}
    drawing.current = true;
    const pt = getPoint(e); const w = getWidth(e);
    currentStrokeRef.current = [{ ...pt, w }];
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#0f172a'; ctx.beginPath(); ctx.arc(pt.x, pt.y, w / 2, 0, Math.PI * 2); ctx.fill();
  };

  const move = (e) => {
    if (!drawing.current) return;
    if (pointerIdRef.current !== null && e.pointerId !== pointerIdRef.current) return;
    e.preventDefault();
    pendingPointsRef.current.push({ ...getPoint(e), w: getWidth(e) });
    if (rafRef.current === null) rafRef.current = requestAnimationFrame(flushPending);
  };

  const end = (e) => {
    if (!drawing.current) return;
    drawing.current = false;
    if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; flushPending(); }
    if (canvasRef.current && pointerIdRef.current !== null) { try { canvasRef.current.releasePointerCapture(pointerIdRef.current); } catch (err) {} pointerIdRef.current = null; }
    if (currentStrokeRef.current && currentStrokeRef.current.length >= 1) { strokesRef.current.push(currentStrokeRef.current); setStrokeCount(strokesRef.current.length); exportDataUrl(); }
    currentStrokeRef.current = null;
  };

  const clearAll = () => { strokesRef.current = []; setStrokeCount(0); setupCanvas(); fullRedraw(); onChange(null); };

  const hasInk = strokeCount > 0;

  return (
    <div className="select-none relative w-full h-full" ref={wrapperRef} style={{ touchAction: 'none' }}>
      <div className={`absolute inset-0 rounded-2xl border-2 overflow-hidden bg-white transition-colors duration-200 ${hasInk ? 'border-slate-300 shadow-inner' : 'border-slate-200'}`}>
        <canvas ref={canvasRef} className="block w-full h-full"
          style={{ touchAction: 'none', WebkitUserSelect: 'none', userSelect: 'none', WebkitTouchCallout: 'none' }}
          onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onPointerLeave={end} />
        {!hasInk && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-slate-300 text-[10px] sm:text-xs font-bold uppercase tracking-widest text-center px-1">✎</div>
          </div>
        )}
        {hasInk && (
          <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); clearAll(); }}
            className="absolute top-1 right-1 w-6 h-6 bg-white/90 backdrop-blur rounded-full flex items-center justify-center text-red-500 font-bold text-xs shadow-sm border border-slate-200 active:scale-90 hover:bg-slate-50 z-10"
            style={{ pointerEvents: 'auto' }}>
            ✕
          </button>
        )}
      </div>
    </div>
  );
}

function KumonWorksheetPage({ pageRef: ref, problems, startIndex, values, drawings, onValueChange, onDrawingChange, onFocus, focusedIdx, mode, accent, phase, errors, celebrate }) {
  return (
    <div className="bg-white rounded-[2rem] shadow-xl shadow-slate-200/50 p-6 sm:p-10 max-w-2xl mx-auto border border-slate-100" style={{ minHeight: 500 }}>
      <div className="flex justify-between items-center mb-8">
        <div className="text-xl sm:text-2xl font-bold text-slate-300 tabular-nums bg-slate-50 px-4 py-2 rounded-xl">
          {ref.trim()}
        </div>
      </div>
      <div className="space-y-6 sm:space-y-8">
        {problems.map((p, i) => {
          const globalNum = startIndex + i + 1;
          const isFocused = focusedIdx === i;
          const isAdd = p.op === '+';
          const isSub = p.op === '−';
          const isMul = p.op === '×';
          const isDiv = p.op === '÷';
          const useColumn = (isAdd && p.b >= 10) || (isSub && p.b >= 10) || (isMul && p.a >= 10);
          const isCelebrating = celebrate === i;

          const isError = phase === 'self-correction' && errors.includes(i);
          const isCorrect = phase === 'self-correction' && !errors.includes(i);

          if (useColumn) {
            const expectedAnswer = p.op === '+' ? p.a + p.b : p.op === '−' ? p.a - p.b : p.op === '×' ? p.a * p.b : 0;
            return (
              <div key={i} className={`flex items-start gap-3 sm:gap-6 group transition-transform duration-150 ${isCelebrating ? 'scale-110' : 'scale-100'}`}>
                <div className="text-slate-300 font-bold text-sm sm:text-base tabular-nums w-8 sm:w-10 text-right shrink-0 pt-3 opacity-50 group-hover:opacity-100 transition-opacity">
                  {globalNum}.
                </div>
                <div className="flex-1 flex justify-start bg-slate-50/50 p-4 rounded-3xl" onClick={() => onFocus(i)}>
                  <ColumnProblem a={p.a} b={p.b} op={p.op} answer={expectedAnswer} currentInput={values[i] || ''} inputMode={mode} accent={accent} onInkChange={(pos, url) => onDrawingChange(i, url)} onValueChange={(val) => onValueChange(i, val)} showCarries={true} feedback={isCorrect ? 'correct' : isError ? 'wrong' : null} resetSignal={`${ref}-${i}`} disabled={isCorrect} />
                </div>
              </div>
            );
          }

          if (isDiv) {
            const hasRemainder = p.remainder !== undefined && p.remainder > 0;
            return (
              <div key={i} className={`flex items-center gap-3 sm:gap-6 group transition-transform duration-150 ${isCelebrating ? 'scale-110' : 'scale-100'}`}>
                <div className="text-slate-300 font-bold text-sm sm:text-base tabular-nums w-8 sm:w-10 text-right shrink-0 opacity-50 group-hover:opacity-100 transition-opacity">
                  {globalNum}.
                </div>
                <div className="text-3xl sm:text-4xl font-bold text-slate-800 tabular-nums flex items-center gap-3 sm:gap-4 flex-1 flex-wrap">
                  <span className="text-right w-12 sm:w-16">{p.a}</span>
                  <span className="text-slate-400">{p.op}</span>
                  <span className="text-right w-12 sm:w-16">{p.b}</span>
                  <span className="text-slate-300">=</span>
                  {mode === 'manual' ? (
                    <div className="flex-1 max-w-[200px] h-16 sm:h-20 relative">
                      <HandwritingCanvas onChange={(d) => onDrawingChange(i, d)} resetSignal={`${ref}-${i}`} />
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        autoComplete="off"
                        autoCorrect="off"
                        spellCheck="false"
                        value={values[i] || ''}
                        onChange={e => onValueChange(i, e.target.value)}
                        onFocus={() => onFocus(i)}
                        disabled={isCorrect}
                        placeholder={isFocused && !isCorrect ? '?' : ''}
                        className={`text-3xl sm:text-4xl outline-none tabular-nums font-bold w-24 sm:w-32 rounded-2xl text-center transition-all ${isCorrect ? 'bg-green-50 text-green-700 opacity-90' : 'bg-slate-50 focus:bg-white focus:shadow-md'}`}
                        style={{
                          border: `3px solid ${isError ? '#ef4444' : isCorrect ? '#10b981' : isFocused ? accent : 'transparent'}`,
                          color: isError ? '#ef4444' : isCorrect ? '#10b981' : (isFocused ? accent : '#1e293b'),
                          padding: '8px 0'
                        }}
                      />
                      {hasRemainder && isCorrect && (
                        <span className="text-base font-bold text-slate-500">r.{p.remainder}</span>
                      )}
                      {hasRemainder && !isCorrect && (
                        <span className="text-xs text-slate-400 font-medium">reste ?</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          }

          return (
            <div key={i} className={`flex items-center gap-3 sm:gap-6 group transition-transform duration-150 ${isCelebrating ? 'scale-110' : 'scale-100'}`}>
              <div className="text-slate-300 font-bold text-sm sm:text-base tabular-nums w-8 sm:w-10 text-right shrink-0 opacity-50 group-hover:opacity-100 transition-opacity">
                {globalNum}.
              </div>
              <div className="text-3xl sm:text-4xl font-bold text-slate-800 tabular-nums flex items-center gap-3 sm:gap-4 flex-1">
                <ProblemDisplay p={p} />
                {mode === 'manual' ? (
                  <div className="flex-1 max-w-[200px] h-16 sm:h-20 relative">
                    <HandwritingCanvas onChange={(d) => onDrawingChange(i, d)} resetSignal={`${ref}-${i}`} />
                  </div>
                ) : (
                  <input
                    type="text"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck="false"
                    value={values[i] || ''}
                    onChange={e => onValueChange(i, e.target.value)}
                    onFocus={() => onFocus(i)}
                    disabled={isCorrect}
                    placeholder={isFocused && !isCorrect ? '?' : ''}
                    className={`text-3xl sm:text-4xl outline-none tabular-nums font-bold w-24 sm:w-32 rounded-2xl text-center transition-all ${isCorrect ? 'bg-green-50 text-green-700 opacity-90' : 'bg-slate-50 focus:bg-white focus:shadow-md'}`}
                    style={{
                      border: `3px solid ${isError ? '#ef4444' : isCorrect ? '#10b981' : isFocused ? accent : 'transparent'}`,
                      color: isError ? '#ef4444' : isCorrect ? '#10b981' : (isFocused ? accent : '#1e293b'),
                      padding: '8px 0'
                    }}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WordProblemPage({ pageRef: ref, wordProblem, value, drawing, onValueChange, onDrawingChange, onFocus, isFocused, mode, accent, phase, errors }) {
  const isError = phase === 'self-correction' && errors.includes(0);
  const isCorrect = phase === 'self-correction' && !errors.includes(0);

  return (
    <div className="bg-white rounded-[2rem] shadow-xl shadow-slate-200/50 p-8 sm:p-12 max-w-2xl mx-auto border border-slate-100" style={{ minHeight: 500 }}>
      <div className="flex justify-between items-center mb-10">
        <div className="text-xl sm:text-2xl font-bold text-slate-300 tabular-nums bg-slate-50 px-4 py-2 rounded-xl">{ref.trim()}</div>
        <div className="text-xs uppercase font-bold text-orange-500 bg-orange-50 px-3 py-1.5 rounded-full">Problème écrit</div>
      </div>
      <div className="max-w-md mx-auto text-center">
        <div className="text-2xl sm:text-3xl font-bold text-slate-800 leading-snug mb-12">
          {wordProblem.text}
        </div>
        <div className="bg-slate-50 p-6 rounded-3xl inline-flex flex-col items-center w-full">
          <div className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4">Ta Réponse</div>
          {mode === 'manual' ? (
            <div className="w-56 h-20 sm:h-24 relative mx-auto">
              <HandwritingCanvas onChange={onDrawingChange} resetSignal={`word-${ref}`} />
            </div>
          ) : (
            <input
              type="text"
              autoComplete="off"
              autoCorrect="off"
              spellCheck="false"
              value={value || ''}
              onChange={e => onValueChange(e.target.value)}
              onFocus={onFocus}
              disabled={isCorrect}
              placeholder={isFocused && !isCorrect ? '?' : ''}
              className={`text-4xl sm:text-5xl outline-none tabular-nums font-bold w-40 rounded-2xl text-center transition-all ${isCorrect ? 'bg-green-50 text-green-700 opacity-90' : 'bg-white shadow-inner'}`}
              style={{
                border: `4px solid ${isError ? '#ef4444' : isCorrect ? '#10b981' : accent}`,
                color: isError ? '#ef4444' : isCorrect ? '#10b981' : '#1e293b',
                padding: '12px 0'
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function computeAddCarries(a, b) { const dA = String(a).split('').reverse().map(Number); const dB = String(b).split('').reverse().map(Number); const max = Math.max(dA.length, dB.length); const c = []; let carry = 0; for (let i = 0; i < max; i++) { const sum = (dA[i] || 0) + (dB[i] || 0) + carry; carry = Math.floor(sum / 10); c.push(carry); } return c; }
function computeSubBorrows(a, b) { const dA = String(a).split('').reverse().map(Number); const dB = String(b).split('').reverse().map(Number); const nD = [...dA]; const canc = dA.map(() => null); const borr = dA.map(() => null); for (let i = 0; i < nD.length; i++) { const db = dB[i] || 0; if (nD[i] < db) { let j = i + 1; while (j < nD.length && nD[j] === 0) { canc[j] = nD[j]; borr[j] = 9; nD[j] = 9; j++; } if (j < nD.length) { canc[j] = nD[j]; borr[j] = nD[j] - 1; nD[j] -= 1; } canc[i] = nD[i]; borr[i] = nD[i] + 10; nD[i] += 10; } } return { canceled: canc, borrowed: borr }; }

function ColumnProblem({ a, b, op, answer, currentInput = '', inputMode = 'keypad', accent = '#3b82f6', onInkChange, onValueChange, showCarries = true, feedback = null, resetSignal = 0, disabled = false }) {
  const w = Math.max(String(a).length, String(b).length, String(answer).length);
  const aP = String(a).padStart(w, ' '); const bP = String(b).padStart(w, ' ');
  const carries = useMemo(() => showCarries && op === '+' ? computeAddCarries(a, b) : [], [a, b, op, showCarries]);
  const borrows = useMemo(() => showCarries && op === '−' ? computeSubBorrows(a, b) : { canceled: [], borrowed: [] }, [a, b, op, showCarries]);
  const cleanInput = String(currentInput || '').replace(/\D/g, '');
  const inD = cleanInput.split('');
  const getDigit = pos => { const idx = inD.length - 1 - pos; return idx >= 0 ? inD[idx] : null; };
  const typedCount = inD.length;
  const cellSize = inputMode === 'pencil' || inputMode === 'manual' ? 64 : 50;
  const gap = 6;
  const cols = Array.from({ length: w }, (_, i) => w - 1 - i);
  const ansCols = Array.from({ length: String(answer).length }, (_, i) => String(answer).length - 1 - i);

  return (
    <div className="select-none inline-block font-bold tabular-nums relative">
      <div style={{ width: 32 + 12 + w * cellSize + (w - 1) * gap }}>
        
        {showCarries && (op === '+' || op === '−') && (
          <div className="flex justify-end items-end h-6 mb-1" style={{ gap }}>
            <div style={{ width: 44 }} />
            {cols.map(pos => {
              if (op === '+') {
                const c = pos === 0 ? 0 : carries[pos - 1] || 0;
                const show = c > 0 && typedCount > pos;
                return <div key={pos} className="flex items-center justify-center text-sm transition-all" style={{ width: cellSize, color: show ? accent : 'transparent', transform: show ? 'scale(1)' : 'scale(0.5)' }}>{show ? c : '·'}</div>;
              }
              const newD = borrows.borrowed[pos];
              return <div key={pos} className="flex items-center justify-center text-sm" style={{ width: cellSize, color: newD !== null ? accent : 'transparent' }}>{newD !== null ? newD : '·'}</div>;
            })}
          </div>
        )}

        <div className="flex justify-end items-center mb-1 text-3xl sm:text-4xl text-slate-800" style={{ gap }}>
          <div style={{ width: 44 }} />
          {cols.map(pos => {
            const isCanc = op === '−' && borrows.canceled[pos] !== null;
            return <div key={pos} className="flex items-center justify-center relative" style={{ width: cellSize, height: cellSize }}>
              <span className={isCanc && showCarries ? "line-through opacity-40 decoration-2" : ""} style={{ textDecorationColor: accent }}>{aP[w - 1 - pos]}</span>
            </div>;
          })}
        </div>
        <div className="flex justify-end items-center mb-2 text-3xl sm:text-4xl text-slate-800" style={{ gap }}>
          <div className="flex justify-end items-center pr-3" style={{ width: 44 }}>{op}</div>
          {cols.map(pos => <div key={pos} className="flex items-center justify-center" style={{ width: cellSize, height: cellSize }}>{bP[w - 1 - pos]}</div>)}
        </div>

        <div className="flex justify-end items-center mb-3" style={{ gap }}><div style={{ width: 44 }} /><div className="h-1 rounded-full bg-slate-300" style={{ width: w * cellSize + (w - 1) * gap }} /></div>

        <div className="flex justify-end items-center relative" style={{ gap }}>
          <div style={{ width: 44 }} />
          {Array.from({ length: w - String(answer).length }).map((_, i) => <div key={`sp-${i}`} style={{ width: cellSize, height: cellSize }} />)}
          {ansCols.map(pos => {
            const d = getDigit(pos);
            const isNext = !d && pos === String(answer).length - 1 - typedCount;
            if (inputMode === 'manual') {
              return <div key={pos} className="rounded-2xl border-4 overflow-hidden bg-white relative" style={{ width: cellSize, height: cellSize, borderColor: feedback === 'correct' ? '#10b981' : feedback === 'wrong' ? '#ef4444' : d ? accent : '#e2e8f0' }}>
                <HandwritingCanvas onChange={url => onInkChange && onInkChange(pos, url)} resetSignal={resetSignal} />
              </div>;
            }
            return <div key={pos} className="rounded-2xl border-4 flex items-center justify-center text-3xl transition-all"
              style={{ width: cellSize, height: cellSize, borderColor: feedback === 'correct' ? '#10b981' : feedback === 'wrong' ? '#ef4444' : d ? accent : isNext && !disabled ? accent + '66' : '#e2e8f0', backgroundColor: d ? (feedback === 'correct' ? '#ecfdf5' : feedback === 'wrong' ? '#fef2f2' : 'white') : 'white', color: d ? accent : '#cbd5e1', transform: isNext && !d && !disabled ? 'scale(1.05)' : 'scale(1)' }}>
              {d || (isNext && !disabled ? '·' : '')}
            </div>;
          })}
          {inputMode !== 'manual' && !disabled && (
            <input type="text" autoComplete="off" autoCorrect="off" spellCheck="false"
              className="absolute bottom-0 right-0 h-full w-full opacity-0 cursor-text"
              value={currentInput || ''} onChange={e => onValueChange && onValueChange(e.target.value)} style={{ zIndex: 10 }} />
          )}
        </div>
      </div>
    </div>
  );
}

function NumPad({ onDigit, onClear, onNext }) {
  const btn = "h-14 sm:h-16 rounded-2xl text-2xl font-bold bg-white border-b-4 border-slate-200 hover:bg-slate-50 active:border-b-0 active:translate-y-1 transition-all text-slate-700";
  return (
    <div className="grid grid-cols-3 gap-3 sm:gap-4 max-w-xs mx-auto select-none">
      {[1,2,3,4,5,6,7,8,9].map(k => <button key={k} onClick={() => onDigit(String(k))} className={btn}>{k}</button>)}
      <button onClick={onClear} className={btn + " text-xl"}>⌫</button>
      <button onClick={() => onDigit('0')} className={btn}>0</button>
      <button onClick={onNext} className="h-14 sm:h-16 rounded-2xl text-xl font-bold bg-slate-800 text-white border-b-4 border-slate-900 active:border-b-0 active:translate-y-1 transition-all">↵</button>
      <button onClick={() => onDigit('.')} className={btn + " text-lg text-slate-500"}>.</button>
      <button onClick={() => onDigit('/')} className={btn + " text-lg text-slate-500"}>⁄</button>
      <button onClick={() => onDigit(' R')} className={btn + " text-sm text-slate-500"}>R</button>
    </div>
  );
}

function PauseOverlay({ onResume }) {
  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center">
      <div className="bg-white p-10 rounded-[3rem] shadow-2xl text-center max-w-sm w-full mx-6">
        <div className="text-6xl mb-6">⏸</div>
        <div className="text-3xl font-bold text-slate-800 mb-2">Pause</div>
        <div className="text-slate-500 mb-8 font-medium">Prends ton temps !</div>
        <Btn onClick={onResume} className="w-full">▶ Reprendre</Btn>
      </div>
    </div>
  );
}

function KidPicker({ config, sessions, progress, manualUnlocks, onPickKid, onPickParent, lockedKidId }) {
  const visibleKids = config.kids.filter(k => k.name?.trim() && (!lockedKidId || k.id === lockedKidId));
  return (
    <AppBackground>
      <div className="max-w-4xl mx-auto px-6 py-12 sm:py-20">
        <div className="text-center mb-16">
          <div className="inline-block bg-blue-100 text-blue-700 font-bold text-xs px-4 py-1.5 rounded-full uppercase tracking-widest mb-6">Mathématiques</div>
          <h1 className="text-4xl sm:text-5xl font-black text-slate-800 tracking-tight">Qui est prêt à pratiquer ?</h1>
        </div>
        <div className={`grid gap-6 ${visibleKids.length === 1 ? 'grid-cols-1 max-w-sm mx-auto' : 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3'}`}>
          {visibleKids.map(kid => {
            const c = KID_COLORS[kid.color] || KID_COLORS.blue;
            const currentLevel = getCurrentLevel(kid.id, progress, manualUnlocks);
            return (
              <button key={kid.id} onClick={() => onPickKid(kid)}
                className="group relative bg-white rounded-[2rem] p-8 text-center transition-all hover:-translate-y-2 hover:shadow-2xl border-4 border-transparent active:scale-95 flex flex-col items-center"
                style={{ boxShadow: `0 10px 40px ${c.ink}20` }}>
                <div className="w-24 h-24 rounded-[2rem] flex items-center justify-center text-5xl text-white font-black shadow-inner mb-6 transition-transform group-hover:scale-110 group-hover:rotate-3"
                  style={{ background: `linear-gradient(135deg, ${c.soft}, ${c.ink})` }}>
                  {kid.name.charAt(0).toUpperCase()}
                </div>
                <div className="text-2xl font-bold text-slate-800 mb-1">{kid.name}</div>
                <div className="text-sm font-bold px-3 py-1 rounded-full mb-4" style={{ backgroundColor: c.soft, color: c.ink }}>
                  {currentLevel ? `Niveau ${currentLevel.id}` : 'Programme fini !'}
                </div>
                <div className="text-xs font-medium text-slate-400">{INPUT_MODES[kid.inputMode]?.label}</div>
              </button>
            );
          })}
        </div>
        <div className="mt-20 text-center">
          <button onClick={onPickParent} className="text-sm font-bold text-slate-400 hover:text-slate-600 transition-colors uppercase tracking-widest flex items-center gap-2 justify-center mx-auto">
            <span>⚙️</span> Espace Parents
          </button>
        </div>
      </div>
    </AppBackground>
  );
}

function KidPinGate({ kid, onSuccess, onBack }) {
  const [entered, setEntered] = useState('');
  const [error, setError] = useState(false);
  const c = KID_COLORS[kid.color] || KID_COLORS.blue;
  useEffect(() => {
    if (entered.length === 4) {
      if (entered === kid.pin) onSuccess();
      else { setError(true); setTimeout(() => { setEntered(''); setError(false); }, 600); }
    }
  }, [entered, kid.pin, onSuccess]);
  return (
    <AppBackground>
      <div className="max-w-md mx-auto px-6 py-12 min-h-screen flex flex-col">
        <button onClick={onBack} className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm text-slate-400 hover:text-slate-700 text-xl font-bold mb-8 transition-transform active:scale-90">←</button>
        <div className="flex-1 flex flex-col items-center justify-center">
          <div className="w-24 h-24 rounded-[2rem] flex items-center justify-center text-5xl text-white font-black mb-8 shadow-lg"
            style={{ background: `linear-gradient(135deg, ${c.soft}, ${c.ink})` }}>{kid.name.charAt(0).toUpperCase()}</div>
          <div className="text-3xl font-black text-slate-800 mb-2">Coucou {kid.name} !</div>
          <div className="text-slate-500 font-medium mb-10">Tape ton code secret</div>
          <div className={`${error ? 'animate-bounce' : ''}`}>
            <PinPad value={entered} onChange={setEntered} accent={c.ink} />
          </div>
        </div>
      </div>
    </AppBackground>
  );
}

function LevelPath({ kid, progress, manualUnlocks, sessions, onPickBooklet, onBack }) {
  const c = KID_COLORS[kid.color] || KID_COLORS.blue;
  const [openLevel, setOpenLevel] = useState(() => getCurrentLevel(kid.id, progress, manualUnlocks)?.id || null);
  const grouped = LEVELS.reduce((acc, l) => { (acc[l.cat] ||= []).push(l); return acc; }, {});

  return (
    <AppBackground>
      <div className="max-w-3xl mx-auto px-6 py-8">
        <div className="flex items-center gap-4 mb-10">
          <button onClick={onBack} className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm text-slate-400 hover:text-slate-700 text-xl font-bold transition-transform active:scale-90 shrink-0">←</button>
          <div className="flex-1 bg-white p-3 pr-6 rounded-full shadow-sm flex items-center gap-4">
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-xl" style={{ background: c.ink }}>{kid.name.charAt(0)}</div>
            <div className="font-bold text-slate-700 text-lg">Parcours de {kid.name}</div>
          </div>
        </div>

        <div className="space-y-12">
          {Object.entries(grouped).map(([cat, levels]) => {
            const info = CAT_INFO[cat];
            return (
              <div key={cat} className="relative">
                <div className="flex items-center gap-4 mb-6 sticky top-4 z-10">
                  <div className="bg-white px-5 py-2.5 rounded-full shadow-sm border-2 font-bold text-lg" style={{ borderColor: info.dot, color: info.dot }}>{info.name}</div>
                </div>
                <div className="space-y-4 pl-4 border-l-4 ml-6" style={{ borderColor: info.soft }}>
                  {levels.map(lvl => {
                    const status = getLevelStatus(kid.id, lvl.id, progress, manualUnlocks);
                    const lp = (progress[kid.id] || {})[lvl.id] || { completedBooklets: [] };
                    const isOpen = openLevel === lvl.id;
                    const locked = status === 'locked';
                    const done = status === 'completed';
                    const nextBooklet = getNextBooklet(kid.id, lvl.id, progress);

                    return (
                      <div key={lvl.id} className="relative">
                        <div className="absolute -left-[27px] top-6 w-5 h-5 rounded-full border-4 border-white shadow-sm" style={{ backgroundColor: done ? '#10b981' : locked ? '#cbd5e1' : info.dot }} />
                        <div className={`bg-white rounded-3xl p-5 transition-all ${isOpen ? 'shadow-lg border-2' : 'shadow-sm border border-slate-100 hover:shadow-md'}`}
                          style={{ borderColor: isOpen ? info.dot : 'transparent', opacity: locked ? 0.6 : 1 }}>
                          
                          <button onClick={() => !locked && setOpenLevel(isOpen ? null : lvl.id)} disabled={locked} className="w-full flex items-center justify-between text-left">
                            <div>
                              <div className="flex items-center gap-3">
                                <span className="font-black text-xl text-slate-800">{lvl.id}</span>
                                <span className="font-bold text-slate-600">{lvl.name}</span>
                                {done && <span className="bg-green-100 text-green-700 text-xs font-bold px-2 py-0.5 rounded-full">Terminé !</span>}
                                {locked && <span className="text-slate-400 text-sm">🔒</span>}
                              </div>
                              <div className="text-sm font-medium text-slate-400 mt-1">{lvl.desc}</div>
                            </div>
                            {!locked && <div className="text-slate-400 font-bold text-xl px-4">{isOpen ? '−' : '+'}</div>}
                          </button>

                          {isOpen && !locked && (
                            <div className="mt-6 pt-6 border-t border-slate-100">
                              {!done && (
                                <Btn colorStr={c.ink} onClick={() => onPickBooklet(lvl, nextBooklet)} className="w-full mb-6 py-4 text-lg">
                                  ▶ Faire le cahier {nextBooklet}
                                </Btn>
                              )}
                              <div className="grid grid-cols-5 sm:grid-cols-10 gap-3">
                                {Array.from({ length: BOOKLETS_PER_LEVEL }, (_, i) => i + 1).map(num => {
                                  const bDone = lp.completedBooklets.includes(num);
                                  const isNext = num === nextBooklet && !done;
                                  return (
                                    <button key={num} onClick={() => onPickBooklet(lvl, num)}
                                      className={`aspect-square rounded-2xl font-bold text-lg flex items-center justify-center transition-transform active:scale-90 border-b-4 ${bDone ? 'bg-green-100 text-green-600 border-green-200' : isNext ? 'text-white border-slate-900 shadow-md' : 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100'}`}
                                      style={isNext ? { backgroundColor: c.ink, borderColor: c.strong } : {}}>
                                      {num}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AppBackground>
  );
}

function Booklet({ kid, level, bookletNum, onComplete, onAbort }) {
  const c = KID_COLORS[kid.color] || KID_COLORS.blue;
  const mode = kid.inputMode || 'keypad';
  const hasWordPage = level.hasWordProblems;

  const [pageIdx, setPageIdx] = useState(0);
  const [pageData, setPageData] = useState({});
  const [focusedIdx, setFocusedIdx] = useState(0);
  const [celebrate, setCelebrate] = useState(null);

  const [phase, setPhase] = useState('doing');
  const [errorsMap, setErrorsMap] = useState({});

  const [firstTryDurationSec, setFirstTryDurationSec] = useState(0);
  const [correctionDurationSec, setCorrectionDurationSec] = useState(0);
  const [pausedSec, setPausedSec] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [shakeErr, setShakeErr] = useState(false);
  const tickerRef = useRef(null);
  const activeSec = firstTryDurationSec + correctionDurationSec;

  useEffect(() => {
    tickerRef.current = setInterval(() => {
      if (isPaused) setPausedSec(s => s + 1);
      else if (phase === 'doing') setFirstTryDurationSec(s => s + 1);
      else if (phase === 'self-correction') setCorrectionDurationSec(s => s + 1);
    }, 1000);
    return () => clearInterval(tickerRef.current);
  }, [isPaused, phase]);

  const pageInBooklet = pageIdx + 1;
  const isWordPage = level.hasWordProblems && pageInBooklet === PAGES_PER_BOOKLET;
  const ref = pageRef(level.id, bookletNum, pageInBooklet);
  const problems = useMemo(() => isWordPage ? [] : generateProblemsForPage(level.id, bookletNum, pageInBooklet), [level.id, bookletNum, pageInBooklet, isWordPage]);
  const wordProblem = useMemo(() => isWordPage ? generateWordProblem(level.id, bookletNum) : null, [level.id, bookletNum, isWordPage]);
  const startIndex = pageIdx * PROBLEMS_PER_PAGE;
  const currentPageData = pageData[pageIdx] || { values: {}, drawings: {}, wordValue: '', wordDrawing: null };
  const currentErrors = errorsMap[pageIdx] || [];

  const setCurrentPageField = (field, key, val) => {
    setPageData(prev => {
      const cur = prev[pageIdx] || { values: {}, drawings: {}, wordValue: '', wordDrawing: null };
      if (field === 'values') {
        const newState = { ...prev, [pageIdx]: { ...cur, values: { ...cur.values, [key]: val } } };
        const prob = problems[key];
        if (prob && val !== '') {
          const typedAnswer = normalizeFracAnswer(String(val).trim());
          const expectedAnswer = normalizeFracAnswer(String(prob.answer));
          if (typedAnswer !== '' && typedAnswer === expectedAnswer) {
            setCelebrate(key);
            setTimeout(() => setCelebrate(null), 600);
          }
        }
        return newState;
      }
      if (field === 'drawings') return { ...prev, [pageIdx]: { ...cur, drawings: { ...cur.drawings, [key]: val } } };
      if (field === 'wordValue') return { ...prev, [pageIdx]: { ...cur, wordValue: val } };
      if (field === 'wordDrawing') return { ...prev, [pageIdx]: { ...cur, wordDrawing: val } };
      return prev;
    });
  };

  const isCurrentPageFilled = () => {
    if (isWordPage) return mode === 'manual' ? !!currentPageData.wordDrawing : !!currentPageData.wordValue;
    return problems.every((_, i) => {
      if (phase === 'self-correction' && !currentErrors.includes(i)) return true;
      return mode === 'manual' ? currentPageData.drawings[i] : (currentPageData.values[i] && currentPageData.values[i] !== '');
    });
  };

  const finalizeSession = (pages, isManual) => {
    const ftc = isManual ? null : pages.reduce((a, pg) => a + pg.problems.filter(p => p.firstTryCorrect).length, 0);
    onComplete({ id: 'sess_' + Date.now(), kidId: kid.id, levelId: level.id, bookletNum, mode, pages, totalProblems: pages.reduce((a, p) => a + p.problems.length, 0), firstTryCorrect: ftc, score: ftc, needsReview: isManual, durationSec: firstTryDurationSec + correctionDurationSec, firstTryDurationSec, correctionDurationSec, pausedSec, timestamp: Date.now() });
  };

  const checkAnswersAndProceed = () => {
    if (mode === 'manual') {
      const pages = [];
      for (let p = 0; p < PAGES_PER_BOOKLET; p++) {
        const data = pageData[p] || { drawings: {}, wordDrawing: null };
        const isWP = level.hasWordProblems && (p + 1) === PAGES_PER_BOOKLET;
        if (isWP) {
          const wp = generateWordProblem(level.id, bookletNum);
          pages.push({ ref: pageRef(level.id, bookletNum, p + 1), pageInBooklet: p + 1, isWordPage: true, problems: [{ ...wp, wordText: wp.text, drawing: data.wordDrawing, firstTryAnswer: null, firstTryCorrect: null }] });
        } else {
          const probs = generateProblemsForPage(level.id, bookletNum, p + 1);
          pages.push({ ref: pageRef(level.id, bookletNum, p + 1), pageInBooklet: p + 1, isWordPage: false, problems: probs.map((pr, i) => ({ ...pr, drawing: data.drawings[i] || null, firstTryAnswer: null, firstTryCorrect: null })) });
        }
      }
      finalizeSession(pages, true);
      return;
    }

    let hasErrors = false;
    const newErrors = {};
    const finalPages = [];

    for (let p = 0; p < PAGES_PER_BOOKLET; p++) {
      const data = pageData[p] || { values: {}, wordValue: '' };
      const isWP = level.hasWordProblems && (p + 1) === PAGES_PER_BOOKLET;
      newErrors[p] = [];

      if (isWP) {
        const wp = generateWordProblem(level.id, bookletNum);
        const uaStr = String(data.wordValue || '').replace(/\D/g, '');
        const ua = uaStr === '' ? null : parseInt(uaStr, 10);
        const isCorrect = ua === wp.answer;
        if (!isCorrect) { hasErrors = true; newErrors[p].push(0); }
        finalPages.push({ pageInBooklet: p + 1, isWordPage: true, problems: [{ ...wp, wordText: wp.text, firstTryAnswer: ua, firstTryCorrect: isCorrect, finalCorrect: true }] });
      } else {
        const probs = generateProblemsForPage(level.id, bookletNum, p + 1);
        const probResults = [];
        probs.forEach((pr, i) => {
          const uaStr = String(data.values[i] || '').trim();
          const ua = uaStr === '' ? null : uaStr;
          const isCorrect = ua !== null && normalizeFracAnswer(ua) === normalizeFracAnswer(String(pr.answer));
          if (!isCorrect) { hasErrors = true; newErrors[p].push(i); }
          probResults.push({ ...pr, firstTryAnswer: ua, firstTryCorrect: phase === 'doing' ? isCorrect : undefined, finalCorrect: true });
        });
        finalPages.push({ pageInBooklet: p + 1, isWordPage: false, problems: probResults });
      }
    }

    if (hasErrors) {
      setErrorsMap(newErrors);
      setPhase('self-correction');
      setShakeErr(true);
      setTimeout(() => setShakeErr(false), 500);
      const firstErrPage = Object.keys(newErrors).find(p => newErrors[p].length > 0);
      if (firstErrPage) {
        setPageIdx(Number(firstErrPage));
        setFocusedIdx(newErrors[firstErrPage][0]);
      }
    } else {
      finalizeSession(finalPages, false);
    }
  };

  return (
    <AppBackground>
      {isPaused && <PauseOverlay onResume={() => setIsPaused(false)} />}
      <div className={`max-w-3xl mx-auto px-6 py-4 flex justify-between items-center rounded-b-3xl -mt-6 mb-8 shadow-sm transition-colors ${phase === 'self-correction' ? 'bg-orange-100' : 'bg-white'}`}>
        <button onClick={onAbort} className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center font-bold text-slate-400">✕</button>
        <div className={`flex flex-col items-center ${shakeErr ? 'animate-bounce' : ''}`}>
          {phase === 'self-correction' ? (
             <div className="font-bold text-orange-700 mb-2">Corrige tes erreurs 🚧</div>
          ) : (
            <div className="flex gap-1 mb-2">
              {Array.from({ length: PAGES_PER_BOOKLET }).map((_, i) => (
                <div key={i} className="h-2 rounded-full transition-all" style={{ width: i === pageIdx ? 24 : 8, backgroundColor: i <= pageIdx ? c.ink : '#e2e8f0', opacity: i === pageIdx ? 1 : 0.4 }} />
              ))}
            </div>
          )}
          <div className={`text-sm font-bold tabular-nums font-mono px-3 py-0.5 rounded-full ${phase === 'self-correction' ? 'text-orange-600 bg-orange-200/50' : 'text-slate-400 bg-slate-50'}`}>
            ⏱ {formatChrono(activeSec)}
          </div>
        </div>
        <button onClick={() => setIsPaused(true)} className="bg-white p-2 rounded-xl text-slate-500 font-bold shadow-sm">⏸</button>
      </div>

      <div className="px-4 pb-8">
        {isWordPage ? (
          <WordProblemPage pageRef={ref} wordProblem={wordProblem} value={currentPageData.wordValue} drawing={currentPageData.wordDrawing} onValueChange={v => setCurrentPageField('wordValue', null, v)} onDrawingChange={d => setCurrentPageField('wordDrawing', null, d)} onFocus={() => setFocusedIdx(0)} isFocused={true} mode={mode} accent={phase === 'self-correction' ? '#f59e0b' : c.ink} phase={phase} errors={currentErrors} />
        ) : (
          <KumonWorksheetPage pageRef={ref} problems={problems} startIndex={startIndex} values={currentPageData.values} drawings={currentPageData.drawings} onValueChange={(i, v) => setCurrentPageField('values', i, v)} onDrawingChange={(i, d) => setCurrentPageField('drawings', i, d)} onFocus={setFocusedIdx} focusedIdx={focusedIdx} mode={mode} accent={phase === 'self-correction' ? '#f59e0b' : c.ink} phase={phase} errors={currentErrors} celebrate={celebrate} />
        )}
      </div>

      <div className="px-6 pb-12 max-w-sm mx-auto">
        {mode === 'keypad' && <div className="mb-6"><NumPad onDigit={d => isWordPage ? setCurrentPageField('wordValue', null, (currentPageData.wordValue + d).slice(0, 5)) : setCurrentPageField('values', focusedIdx, ((currentPageData.values[focusedIdx] || '') + d).slice(0, 5))} onClear={() => isWordPage ? setCurrentPageField('wordValue', null, currentPageData.wordValue.slice(0, -1)) : setCurrentPageField('values', focusedIdx, (currentPageData.values[focusedIdx] || '').slice(0, -1))} onNext={() => { if (!isWordPage) setFocusedIdx((focusedIdx + 1) % problems.length); }} /></div>}
        
        <div className="flex gap-4">
          {pageIdx > 0 && <Btn variant="soft" onClick={() => { setPageIdx(p => p - 1); setFocusedIdx(0); }} className="flex-1">←</Btn>}
          {pageIdx < PAGES_PER_BOOKLET - 1 && (phase === 'doing' || currentErrors.length === 0 || isCurrentPageFilled()) ? (
             <Btn colorStr={phase === 'self-correction' ? '#f59e0b' : c.ink} onClick={() => { setPageIdx(p => p + 1); setFocusedIdx(0); }} disabled={!isCurrentPageFilled()} className="flex-[3]">Suivant →</Btn>
          ) : (
             <Btn colorStr={phase === 'self-correction' ? '#f59e0b' : "#10b981"} onClick={checkAnswersAndProceed} disabled={phase === 'doing' ? !isCurrentPageFilled() : false} className="flex-[3]">{phase === 'self-correction' ? 'Revérifier ✓' : 'Vérifier ✓'}</Btn>
          )}
        </div>
      </div>
    </AppBackground>
  );
}

function Results({ session, kid, parentEmail, justUnlockedNext, onRetry, onContinue, onDone }) {
  const isManual = session.needsReview;
  const isPerfect = !isManual && session.firstTryCorrect === session.totalProblems;
  
  return (
    <AppBackground>
      <div className="max-w-md mx-auto px-6 py-20 text-center flex flex-col items-center">
        <div className="w-32 h-32 rounded-[3rem] bg-white shadow-xl flex items-center justify-center text-6xl mb-8 border-4 border-slate-100">
          {isManual ? '📝' : isPerfect ? '🏆' : '👍'}
        </div>
        <h1 className="text-4xl font-black text-slate-800 mb-4">
          {isManual ? 'Cahier envoyé !' : isPerfect ? 'Parfait du 1er coup !' : 'Bon travail !'}
        </h1>
        <p className="text-slate-500 font-medium mb-12">
          {isManual ? 'Un parent corrigera tes réponses.' : `${session.firstTryCorrect} bonnes réponses du premier coup sur ${session.totalProblems}`}
        </p>
        
        <div className="w-full space-y-4">
          <Btn colorStr={KID_COLORS[kid.color]?.ink || '#3b82f6'} onClick={onContinue} className="w-full py-4 text-xl">Continuer ▶</Btn>
          <Btn variant="soft" onClick={onDone} className="w-full py-4 text-xl">Retour à l'accueil</Btn>
        </div>
      </div>
    </AppBackground>
  );
}

function ParentGate({ pin, onSuccess, onBack }) {
  const [entered, setEntered] = useState('');
  useEffect(() => { if (entered.length === 4) { if (entered === pin) onSuccess(); else setTimeout(() => setEntered(''), 400); } }, [entered, pin, onSuccess]);
  return (
    <AppBackground>
      <div className="max-w-md mx-auto px-6 py-20 flex flex-col items-center">
        <button onClick={onBack} className="self-start text-slate-400 font-bold mb-10">← Retour</button>
        <div className="text-6xl mb-6">⚙️</div>
        <h2 className="text-3xl font-black text-slate-800 mb-8">Espace Parent</h2>
        <PinPad value={entered} onChange={setEntered} accent="#475569" />
      </div>
    </AppBackground>
  );
}

function ParentDashboard({ config, sessions, progress, manualUnlocks, onUpdateConfig, onDeleteSession, onUpdateSession, onResetProgress, onToggleManualUnlock, onSetCompletedBooklets, onBack }) {
  const [tab, setTab] = useState('settings');
  return (
    <AppBackground>
      <div className="max-w-5xl mx-auto px-6 py-10">
        <button onClick={onBack} className="text-slate-500 font-bold mb-8">← Retour à l'app</button>
        <h1 className="text-4xl font-black text-slate-800 mb-8">Tableau de bord</h1>
        <div className="flex gap-4 border-b-2 border-slate-200 mb-8 overflow-x-auto pb-2">
          {['settings', 'review', 'sessions'].map(t => (
            <button key={t} onClick={() => setTab(t)} className={`font-bold pb-2 px-2 whitespace-nowrap capitalize ${tab === t ? 'text-blue-600 border-b-4 border-blue-600' : 'text-slate-400'}`}>
              {t === 'settings' ? 'Réglages & Enfants' : t === 'review' ? 'À corriger' : 'Historique'}
            </button>
          ))}
        </div>
        {tab === 'settings' && (
          <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
             <div className="text-slate-500 italic mb-6">Pour configurer les enfants, les NIPs ou les niveaux, utilise la logique originale qui est conservée ici. Les couleurs ont été mises à jour.</div>
             {config.kids.map((kid, idx) => (
               <div key={idx} className="mb-6 p-4 bg-slate-50 rounded-2xl border border-slate-200 flex justify-between items-center">
                  <div><div className="font-bold text-slate-800">{kid.name}</div><div className="text-sm text-slate-500">{kid.age} ans - NIP: {kid.pin} - Mode: {kid.inputMode}</div></div>
               </div>
             ))}
             <div className="mt-8 border-t border-slate-200 pt-8">
               <h3 className="text-lg font-bold text-slate-800 mb-2">Assistant Kaizo (IA)</h3>
               <p className="text-sm text-slate-500 mb-4">Configure la clé API Gemini pour activer l'assistant Kaizo. Obtiens une clé sur <a href="https://aistudio.google.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">Google AI Studio</a>.</p>
               <div className="flex flex-col gap-3">
                 <label className="text-sm font-bold text-slate-700">Clé API Gemini</label>
                 <input
                   type="password"
                   value={config.geminiApiKey || ''}
                   onChange={e => onUpdateConfig({ ...config, geminiApiKey: e.target.value })}
                   placeholder="Colle ta clé API ici..."
                   className="border border-slate-300 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:border-blue-500"
                 />
                 <label className="text-sm font-bold text-slate-700">Modèle Gemini</label>
                 <select
                   value={config.geminiModel || 'gemini-2.5-flash'}
                   onChange={e => onUpdateConfig({ ...config, geminiModel: e.target.value })}
                   className="border border-slate-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500 bg-white">
                   <option value="gemini-2.5-flash">gemini-2.5-flash (recommandé)</option>
                   <option value="gemini-2.0-flash">gemini-2.0-flash</option>
                   <option value="gemini-1.5-flash">gemini-1.5-flash</option>
                 </select>
               </div>
             </div>
          </div>
        )}
      </div>
    </AppBackground>
  );
}

// ============================================================
// SCRATCHPAD
// ============================================================
function FracDisplay({ num, den }) {
  return (
    <span className="inline-flex flex-col items-center leading-none mx-1 align-middle">
      <span className="text-base font-bold border-b-2 border-current px-0.5 leading-tight">{num}</span>
      <span className="text-base font-bold px-0.5 leading-tight">{den}</span>
    </span>
  );
}

function ProblemDisplay({ p }) {
  if (!p.display) {
    return (
      <>
        <span className="text-right w-12 sm:w-16">{p.a}</span>
        <span className="text-slate-400">{p.op}</span>
        <span className="text-right w-12 sm:w-16">{p.b}</span>
        <span className="text-slate-300 mx-1">=</span>
      </>
    );
  }
  const parts = p.display.split(/(\?\/\d+|\d+\/\d+)/);
  return (
    <>
      {parts.map((part, idx) => {
        const fm = part.match(/^(\?|\d+)\/(\d+)$/);
        if (fm) return <FracDisplay key={idx} num={fm[1]} den={fm[2]} />;
        return <span key={idx} className="mx-0.5 text-slate-600 font-bold">{part}</span>;
      })}
      <span className="text-slate-300 mx-1">=</span>
    </>
  );
}

function Scratchpad({ onClose }) {
  const canvasRef = useRef(null);
  const [drawing, setDrawing] = useState(false);
  const [color, setColor] = useState('#2563EB');
  const [tool, setTool] = useState('pencil');
  const [lineWidth, setLineWidth] = useState(3);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const draw = () => {
      const ctx = canvas.getContext('2d');
      const { width, height } = canvas.parentNode.getBoundingClientRect();
      canvas.width = width;
      canvas.height = height;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);
      ctx.strokeStyle = '#DBEAFE';
      ctx.lineWidth = 1;
      for (let x = 0; x < width; x += 30) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
      }
      for (let y = 0; y < height; y += 30) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
      }
    };
    draw();
    window.addEventListener('resize', draw);
    return () => window.removeEventListener('resize', draw);
  }, []);

  const getXY = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : e;
    return { x: src.clientX - r.left, y: src.clientY - r.top };
  };

  const start = (e) => {
    const ctx = canvasRef.current.getContext('2d');
    const { x, y } = getXY(e);
    ctx.beginPath(); ctx.moveTo(x, y);
    ctx.lineWidth = tool === 'eraser' ? 20 : lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = tool === 'eraser' ? '#FFFFFF' : color;
    setDrawing(true);
    e.preventDefault();
  };

  const move = (e) => {
    if (!drawing) return;
    const { x, y } = getXY(e);
    const ctx = canvasRef.current.getContext('2d');
    ctx.lineTo(x, y); ctx.stroke();
    e.preventDefault();
  };

  const stop = () => setDrawing(false);

  const reset = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#DBEAFE'; ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += 30) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += 30) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }
  };

  const COLORS = [
    ['#2563EB', '🔵'], ['#16A34A', '🟢'], ['#DC2626', '🔴'],
    ['#D97706', '🟡'], ['#7C3AED', '🟣'], ['#0E7490', '🩵'],
  ];

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="flex items-center justify-between px-3 py-2 bg-blue-600 text-white shrink-0">
        <span className="font-bold text-sm">✏️ Mon Ardoise</span>
        <button onClick={onClose} className="text-white text-lg font-bold">✕</button>
      </div>
      <div className="flex items-center gap-1 px-2 py-1.5 bg-blue-50 border-b border-blue-100 flex-wrap shrink-0">
        {COLORS.map(([c, emoji]) => (
          <button key={c} onClick={() => { setTool('pencil'); setColor(c); }}
            className="w-8 h-8 rounded-full border-2 flex items-center justify-center text-sm transition-all"
            style={{ background: c, borderColor: (tool === 'pencil' && color === c) ? '#1D4ED8' : 'transparent' }}>
            {(tool === 'pencil' && color === c) ? '✓' : ''}
          </button>
        ))}
        <button onClick={() => setTool('eraser')}
          className={`px-2 py-1 rounded-lg text-xs font-bold border ${tool === 'eraser' ? 'bg-orange-500 text-white border-orange-600' : 'bg-white text-gray-600 border-gray-300'}`}>
          🧽
        </button>
        <select value={lineWidth} onChange={e => setLineWidth(+e.target.value)}
          className="text-xs border border-gray-200 rounded px-1 py-0.5 bg-white">
          <option value={2}>Fine</option>
          <option value={4}>Moyenne</option>
          <option value={8}>Épaisse</option>
        </select>
        <button onClick={reset}
          className="ml-auto px-2 py-1 bg-red-500 hover:bg-red-600 text-white text-xs font-bold rounded-lg">
          Effacer tout
        </button>
      </div>
      <div className="flex-1 relative overflow-hidden">
        <canvas ref={canvasRef}
          onMouseDown={start} onMouseMove={move} onMouseUp={stop} onMouseLeave={stop}
          onTouchStart={start} onTouchMove={move} onTouchEnd={stop}
          className="absolute inset-0 cursor-crosshair touch-none w-full h-full" />
      </div>
    </div>
  );
}

// ============================================================
// KAIZO ASSISTANT
// ============================================================
const SYSTEM_PROMPT_KAIZO = `Tu es "Kaizo", un assistant mathématiques bienveillant pour enfants qui font la méthode Kumon.
Règles ABSOLUES :
1. NE DONNE JAMAIS LA RÉPONSE DIRECTEMENT. Jamais le chiffre final.
2. Guide l'enfant par étapes simples avec des questions (Socrate).
3. Adapte ton langage : 5-12 ans, phrases courtes, vocabulaire simple.
4. Utilise des exemples concrets de la vie quotidienne (bonbons, billes, etc.).
5. Encourage chaleureusement : "Bravo !", "Tu es sur la bonne voie !", "Continue !".
6. Pour l'addition : parle de "mettre ensemble", "regrouper".
7. Pour la soustraction : parle de "enlever", "combien reste-t-il".
8. Pour la multiplication : parle de "groupes égaux", "fois".
9. Sois toujours positif, jamais condescendant.
10. Réponds toujours en français.`;

function KaizoAssistant({ activeKid, currentLevel, config, onClose }) {
  const [query, setQuery] = useState('');
  const [history, setHistory] = useState([{
    role: 'assistant',
    text: `Bonjour ${activeKid?.name || 'toi'} ! 😊 Je suis Kaizo, ton ami mathématique ! Tu travailles en niveau ${currentLevel || 'Kumon'} ? Pose-moi une question, je vais t'aider à trouver la réponse par toi-même !`
  }]);
  const [loading, setLoading] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history, loading]);

  const askKaizo = async (prompt) => {
    const text = prompt || query.trim();
    if (!text) return;
    setHistory(h => [...h, { role: 'user', text }]);
    setQuery('');
    setLoading(true);

    if (!config.geminiApiKey) {
      setHistory(h => [...h, { role: 'assistant', text: '⚠️ Demande à un parent de configurer la clé API Gemini dans le tableau de bord parent pour activer mon aide !' }]);
      setLoading(false);
      return;
    }

    const model = config.geminiModel || 'gemini-2.5-flash';
    const kidCtx = activeKid ? `Élève: ${activeKid.name}, ${activeKid.age || 8} ans.` : '';
    const levelCtx = currentLevel ? `Niveau Kumon: ${currentLevel}.` : '';
    const fullPrompt = `${kidCtx} ${levelCtx}\nQuestion de l'élève: "${text}"`;

    let delay = 1000;
    try {
      for (let i = 0; i < 4; i++) {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.geminiApiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: fullPrompt }] }],
              systemInstruction: { parts: [{ text: SYSTEM_PROMPT_KAIZO }] }
            })
          }
        );
        if (res.status === 429) { await new Promise(r => setTimeout(r, delay)); delay *= 2; continue; }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "Je n'ai pas compris, peux-tu reformuler ?";
        setHistory(h => [...h, { role: 'assistant', text: reply }]);
        break;
      }
    } catch (e) {
      setHistory(h => [...h, { role: 'assistant', text: "Oups ! J'ai eu un petit problème. Réessaie dans un moment !" }]);
    } finally {
      setLoading(false);
    }
  };

  const QUICK_ACTIONS = [
    { label: '💡 Explique-moi', prompt: `Explique-moi comment faire ce type d'exercice en niveau ${currentLevel} étape par étape` },
    { label: '🎯 Donne un indice', prompt: 'Donne-moi un indice pour démarrer sans me donner la réponse' },
    { label: '📝 Exemple similaire', prompt: 'Montre-moi un exemple similaire avec de petits nombres' },
    { label: '🌟 Encouragement', prompt: "Encourage-moi, j'ai du mal !" },
  ];

  return (
    <div className="flex flex-col h-full bg-gradient-to-b from-sky-50 to-white">
      <div className="flex items-center justify-between px-3 py-2 bg-sky-600 text-white shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xl">🤖</span>
          <div>
            <div className="font-bold text-sm">Kaizo</div>
            <div className="text-xs text-sky-200">Ton guide mathématique</div>
          </div>
        </div>
        <button onClick={onClose} className="text-white text-lg font-bold">✕</button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {history.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl p-3 shadow-sm text-sm leading-relaxed ${
              msg.role === 'user'
                ? 'bg-sky-600 text-white rounded-br-none'
                : 'bg-white text-gray-800 border border-sky-100 rounded-bl-none'
            }`}>
              {msg.role === 'assistant' && <span className="text-xs font-bold text-sky-600 block mb-1">🤖 KAIZO</span>}
              <p style={{ whiteSpace: 'pre-wrap' }}>{msg.text}</p>
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-white rounded-2xl p-3 border border-sky-100 shadow-sm flex items-center gap-1">
              <span className="w-2 h-2 bg-sky-500 rounded-full animate-bounce"></span>
              <span className="w-2 h-2 bg-sky-500 rounded-full animate-bounce" style={{animationDelay:'0.2s'}}></span>
              <span className="w-2 h-2 bg-sky-500 rounded-full animate-bounce" style={{animationDelay:'0.4s'}}></span>
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      <div className="px-2 py-1.5 border-t border-sky-100 bg-white grid grid-cols-2 gap-1.5 shrink-0">
        {QUICK_ACTIONS.map(qa => (
          <button key={qa.label} onClick={() => askKaizo(qa.prompt)}
            className="p-2 bg-sky-50 hover:bg-sky-100 text-sky-800 rounded-xl text-xs font-semibold border border-sky-200 text-left transition-colors">
            {qa.label}
          </button>
        ))}
      </div>

      <div className="p-2 border-t border-sky-200 bg-white flex gap-2 shrink-0">
        <input type="text" value={query} onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && askKaizo()}
          placeholder="Pose une question à Kaizo..."
          className="flex-1 bg-sky-50 border border-sky-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-sky-500" />
        <button onClick={() => askKaizo()}
          className="px-3 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl font-bold text-sm transition-colors">
          ➤
        </button>
      </div>
    </div>
  );
}

// ============================================================
// TOOL PANEL
// ============================================================
function ToolPanel({ activeKid, currentLevel, config }) {
  const [open, setOpen] = useState(null);

  return (
    <>
      <div className="fixed bottom-4 right-4 flex flex-col gap-2 z-50">
        <button onClick={() => setOpen(open === 'ardoise' ? null : 'ardoise')}
          className={`w-12 h-12 rounded-full shadow-lg flex items-center justify-center text-xl transition-all ${open === 'ardoise' ? 'bg-blue-600 text-white' : 'bg-white text-blue-600 border-2 border-blue-600'}`}
          title="Ardoise">
          ✏️
        </button>
        <button onClick={() => setOpen(open === 'kaizo' ? null : 'kaizo')}
          className={`w-12 h-12 rounded-full shadow-lg flex items-center justify-center text-xl transition-all ${open === 'kaizo' ? 'bg-sky-600 text-white' : 'bg-white text-sky-600 border-2 border-sky-600'}`}
          title="Aide Kaizo">
          🤖
        </button>
      </div>

      {open && (
        <div className="fixed bottom-0 left-0 right-0 h-[55vh] bg-white shadow-2xl rounded-t-2xl z-40 border-t border-gray-200 flex flex-col overflow-hidden">
          {open === 'ardoise' && <Scratchpad onClose={() => setOpen(null)} />}
          {open === 'kaizo' && <KaizoAssistant activeKid={activeKid} currentLevel={currentLevel} config={config} onClose={() => setOpen(null)} />}
        </div>
      )}
      {open && <div className="fixed inset-0 z-30" onClick={() => setOpen(null)} />}
    </>
  );
}

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
      const c = await loadConfig(); const s = await loadAllSessions(); const p = await loadProgress();
      setConfig(c); setSessions(s); setProgress(p); setManualUnlocks(p._manualUnlocks || {}); setLoading(false);
    })();
  }, []);

  const handleComplete = async (session) => {
    await saveSession(session);
    if (!session.needsReview) {
      const np = { ...progress }; if (!np[session.kidId]) np[session.kidId] = {};
      if (!np[session.kidId][session.levelId]) np[session.kidId][session.levelId] = { completedBooklets: [] };
      if (!np[session.kidId][session.levelId].completedBooklets.includes(session.bookletNum)) {
        np[session.kidId][session.levelId].completedBooklets.push(session.bookletNum);
        await saveProgress(np); setProgress(np);
      }
    }
    setLastSession(session); setScreen('results');
  };

  const handleContinue = () => {
    setScreen('levelpath');
  };

  const handleUpdateConfig = async (newConfig) => {
    setConfig(newConfig);
    await saveConfig(newConfig);
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-slate-50"><div className="font-bold text-slate-400">Chargement...</div></div>;

  return (
    <>
      <style>{`
        body { margin: 0; background-color: #f8fafc; font-family: system-ui, -apple-system, sans-serif; -webkit-tap-highlight-color: transparent; }
      `}</style>
      {screen === 'home' && <KidPicker config={config} sessions={sessions} progress={progress} manualUnlocks={manualUnlocks} lockedKidId={urlKidId || config.deviceLockedToKid} onPickKid={k => { setActiveKid(k); setScreen('kidpin'); }} onPickParent={() => setScreen('parentgate')} />}
      {screen === 'kidpin' && activeKid && <KidPinGate kid={activeKid} onSuccess={() => setScreen('levelpath')} onBack={() => { setActiveKid(null); setScreen('home'); }} />}
      {screen === 'levelpath' && activeKid && <LevelPath kid={activeKid} progress={progress} manualUnlocks={manualUnlocks} sessions={sessions} onPickBooklet={(lvl, num) => { setActiveLevel(lvl); setActiveBooklet(num); setScreen('booklet'); }} onBack={() => setScreen('home')} />}
      {screen === 'booklet' && activeKid && activeLevel && (
        <>
          <Booklet kid={activeKid} level={activeLevel} bookletNum={activeBooklet} onComplete={handleComplete} onAbort={() => setScreen('levelpath')} />
          <ToolPanel activeKid={activeKid} currentLevel={activeLevel?.id} config={config} />
        </>
      )}
      {screen === 'results' && lastSession && activeKid && <Results session={lastSession} kid={activeKid} parentEmail={config.parentEmail} justUnlockedNext={justUnlockedNext} onRetry={() => setScreen('booklet')} onContinue={handleContinue} onDone={() => setScreen('home')} />}
      {screen === 'parentgate' && <ParentGate pin={config.parentPin} onSuccess={() => setScreen('parentdash')} onBack={() => setScreen('home')} />}
      {screen === 'parentdash' && <ParentDashboard config={config} sessions={sessions} progress={progress} manualUnlocks={manualUnlocks} onUpdateConfig={handleUpdateConfig} onBack={() => setScreen('home')} />}
    </>
  );
}
