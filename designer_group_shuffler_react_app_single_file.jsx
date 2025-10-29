import React, { useMemo, useState, useEffect } from "react";

// ==========================================
// Designer Group Shuffler — Single-File React App
// Minimal, fun UI; deterministic reshuffles via seed
// ==========================================

// ----------------------------
// Seed Explanation
// ----------------------------
// The seed functions below (`mulberry32` and `hashStringToSeed`) generate a deterministic
// random number generator. If you reuse the same seed string (e.g., "20251029"),
// the randomization results will be identical on every run. `hashStringToSeed` converts
// a human-readable seed string into an integer. `mulberry32` then returns a function
// that produces a repeatable sequence of pseudorandom numbers (0..1). Using the same
// input seed always yields the same shuffle pattern, which is essential for reproducible
// group creation and debugging.

// ----------------------------
// Types (JSDoc for dev-time hints)
// ----------------------------
/** @typedef {"Junior"|"Medior"|"Senior"} Seniority */
/** @typedef {"Front Office"|"Back Office"} Office */

/** @typedef {{
 *  id: string;
 *  name: string;
 *  seniority: Seniority;
 *  office: Office;
 *  tags?: string[];
 *  notes?: string;
 *  locked?: boolean; // lock in current group
 *  pinnedGroupId?: string | null; // pin to a specific group id (not surfaced yet)
 * }} Designer */

/** @typedef {{
 *  id: string;
 *  name: string; // emoji + fruit/animal
 *  members: Designer[];
 *  constraintOK: boolean;
 *  notes?: string;
 * }} Group */

// ----------------------------
// Name Pools
// ----------------------------
const FRUITS = [
  "🍎 Apples", "🍐 Pears", "🍊 Oranges", "🍋 Lemons", "🍌 Bananas", "🍉 Watermelons",
  "🍇 Grapes", "🍓 Strawberries", "🫐 Blueberries", "🍒 Cherries", "🥝 Kiwis",
  "🍍 Pineapples", "🥭 Mangoes", "🍑 Peaches", "🍈 Melons", "🥥 Coconuts"
];

const ANIMALS = [
  "🦊 Foxes", "🐼 Pandas", "🐯 Tigers", "🐵 Monkeys", "🐧 Penguins", "🐨 Koalas",
  "🐰 Rabbits", "🦁 Lions", "🐸 Frogs", "🦉 Owls", "🐺 Wolves", "🐢 Turtles",
  "🐮 Cows", "🐱 Cats", "🐶 Dogs", "🦌 Deer"
];

const ADJECTIVES = [
  "Swift", "Bright", "Brisk", "Sunny", "Cozy", "Lucky", "Zesty", "Bold", "Curious", "Chill", "Lively", "Cheery", "Snappy"
];

// ----------------------------
// Seedable RNG helpers
// ----------------------------
function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStringToSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
  }
  return h >>> 0;
}

function shuffleArray(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

function countBySeniority(list) {
  return list.reduce((acc, p) => {
    acc[p.seniority] = (acc[p.seniority] || 0) + 1;
    return acc;
  }, {});
}

function countByOffice(list) {
  return list.reduce((acc, p) => {
    acc[p.office] = (acc[p.office] || 0) + 1;
    return acc;
  }, {});
}

// ----------------------------
// Constraints & Grouping
// ----------------------------
function generateGroupNames(numGroups, rng) {
  const pool = shuffleArray([...FRUITS, ...ANIMALS], rng);
  const names = [];
  for (let i = 0; i < numGroups; i++) {
    if (i < pool.length) {
      names.push(pool[i]);
    } else {
      const base = pool[i % pool.length];
      const adj = ADJECTIVES[Math.floor(rng() * ADJECTIVES.length)];
      names.push(`${adj} ${base}`);
    }
  }
  return names;
}

function precheckConstraints(participants, settings) {
  const { groupSize, minSeniorsPerGroup, requireOfficeMix } = settings;
  if (!Number.isFinite(groupSize) || groupSize < 2) {
    return { ok: false, reason: "Group size must be at least 2." };
  }
  const total = participants.length;
  if (total === 0) return { ok: false, reason: "Add at least one designer." };
  const numGroups = Math.ceil(total / groupSize);
  const seniors = participants.filter(p => p.seniority === "Senior").length;
  if (minSeniorsPerGroup > 0 && seniors < numGroups * minSeniorsPerGroup) {
    return { ok: false, reason: `Need at least ${numGroups * minSeniorsPerGroup} Seniors for ${numGroups} groups.` };
  }
  const hasFO = participants.some(p => p.office === "Front Office");
  const hasBO = participants.some(p => p.office === "Back Office");
  if (requireOfficeMix && (!hasFO || !hasBO) && total >= 2) {
    return { ok: false, reason: "Office mix required, but not enough diversity (need FO and BO)." };
  }
  return { ok: true, numGroups };
}

function buildGroups(participants, settings, rng, preserveLocksFrom) {
  const { groupSize, minSeniorsPerGroup, requireOfficeMix } = settings;
  const total = participants.length;
  const numGroups = Math.ceil(total / groupSize);

  /** @type {Group[]} */
  let groups = new Array(numGroups).fill(0).map((_, i) => ({
    id: preserveLocksFrom?.[i]?.id || uid("g"),
    name: "",
    members: [],
    constraintOK: true,
  }));

  // Carry over locked members if present
  if (preserveLocksFrom && preserveLocksFrom.length) {
    const byId = Object.fromEntries(participants.map(p => [p.id, p]));
    preserveLocksFrom.forEach((g, gi) => {
      g.members.forEach(m => {
        const candidate = byId[m.id];
        if (candidate && candidate.locked && groups[gi]) {
          groups[gi].members.push(candidate);
        }
      });
    });
  }

  // Remaining pool
  const lockedIds = new Set(groups.flatMap(g => g.members.map(m => m.id)));
  let pool = participants.filter(p => !lockedIds.has(p.id));

  // Phase 1: seed required Seniors per group
  const seniors = shuffleArray(pool.filter(p => p.seniority === "Senior"), rng);
  for (let s = 0; s < (minSeniorsPerGroup || 0); s++) {
    for (let gi = 0; gi < groups.length; gi++) {
      const senior = seniors.pop();
      if (senior) groups[gi].members.push(senior);
    }
  }
  const placedIds = new Set(groups.flatMap(g => g.members.map(m => m.id)));
  pool = pool.filter(p => !placedIds.has(p.id));

  // Phase 2: ensure office mix seeds if required
  if (requireOfficeMix) {
    for (let gi = 0; gi < groups.length; gi++) {
      const g = groups[gi];
      const sizeLeft = groupSize - g.members.length;
      if (sizeLeft <= 0) continue;
      const needFO = !g.members.some(m => m.office === "Front Office");
      const needBO = !g.members.some(m => m.office === "Back Office");
      if (needFO) {
        const idx = pool.findIndex(p => p.office === "Front Office");
        if (idx >= 0) { g.members.push(pool[idx]); pool.splice(idx, 1); }
      }
      if (g.members.length < groupSize && needBO) {
        const idx = pool.findIndex(p => p.office === "Back Office");
        if (idx >= 0) { g.members.push(pool[idx]); pool.splice(idx, 1); }
      }
    }
  }

  // Phase 3: fill by simple greedy balancing + small randomness
  function scoreCandidateForGroup(candidate, group) {
    const sCount = countBySeniority(group.members);
    const oCount = countByOffice(group.members);
    let score = 0;
    score += Math.max(0, 10 - group.members.length); // prefer emptier groups
    if (candidate.seniority === "Senior" && (sCount["Senior"] || 0) === 0) score += 5; // spread seniors
    if ((oCount["Front Office"] || 0) === 0 && candidate.office === "Front Office") score += 3;
    if ((oCount["Back Office"] || 0) === 0 && candidate.office === "Back Office") score += 3;
    return score;
  }

  pool = shuffleArray(pool, rng);
  for (const cand of pool) {
    const candidates = groups.map((g, gi) => ({ gi, g })).filter(x => x.g.members.length < groupSize);
    if (!candidates.length) break;
    let best = candidates[0];
    let bestScore = -Infinity;
    for (const c of candidates) {
      const sc = scoreCandidateForGroup(cand, c.g) + rng();
      if (sc > bestScore) { best = c; bestScore = sc; }
    }
    groups[best.gi].members.push(cand);
  }

  // Assign names
  const names = generateGroupNames(groups.length, rng);
  groups = groups.map((g, i) => ({ ...g, name: names[i] }));

  // Evaluate constraints per group
  groups.forEach(g => {
    let ok = true;
    const sCount = countBySeniority(g.members);
    if ((sCount["Senior"] || 0) < (minSeniorsPerGroup || 0)) ok = false;
    if (requireOfficeMix && g.members.length >= 2) {
      const fo = g.members.some(m => m.office === "Front Office");
      const bo = g.members.some(m => m.office === "Back Office");
      if (!(fo && bo)) ok = false;
    }
    g.constraintOK = ok;
  });

  return groups;
}

// ----------------------------
// CSV/JSON import & export
// ----------------------------
function parseCSV(text) {
  // naive CSV (no quoted commas support); expects headers: name,seniority,office
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.trim().toLowerCase());
  const nameIdx = headers.indexOf("name");
  const seniorityIdx = headers.indexOf("seniority");
  const officeIdx = headers.indexOf("office");
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map(c => c.trim());
    if (!cols[nameIdx]) continue;
    /** @type {Designer} */
    const row = {
      id: uid("p"),
      name: cols[nameIdx],
      seniority: /** @type {Seniority} */((cols[seniorityIdx] || "Medior").replace(/^\w/, s => s.toUpperCase())),
      office: /** @type {Office} */((cols[officeIdx] || "Front Office").replace(/^(fo|bo)$/i, m => m.toLowerCase() === "fo" ? "Front Office" : "Back Office")),
      locked: false,
      pinnedGroupId: null,
    };
    out.push(row);
  }
  return out;
}

function exportText(groups) {
  const lines = groups.map(g => {
    const members = g.members.map(m => `${m.name} (${m.seniority}, ${m.office === "Front Office" ? "FO" : "BO"})`).join(", ");
    const mark = g.constraintOK ? "✓" : "!";
    return `${mark} ${g.name} — [${members}]`;
  });
  return lines.join("\n");
}

function exportCSV(groups) {
  const rows = ["group_id,group_name,member,seniority,office"];
  groups.forEach(g => {
    g.members.forEach(m => {
      rows.push([g.id, g.name, m.name, m.seniority, m.office].join(","));
    });
  });
  return rows.join("\n");
}

function download(filename, text) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ----------------------------
// Demo Seed Data
// ----------------------------
const DEMO_PARTICIPANTS = [
  { name: "Alice", seniority: "Senior", office: "Front Office" },
  { name: "Bob", seniority: "Medior", office: "Back Office" },
  { name: "Chloe", seniority: "Junior", office: "Front Office" },
  { name: "Dmitri", seniority: "Senior", office: "Back Office" },
  { name: "Esha", seniority: "Medior", office: "Front Office" },
  { name: "Farid", seniority: "Junior", office: "Back Office" },
  { name: "Gwen", seniority: "Medior", office: "Front Office" },
  { name: "Hiro", seniority: "Senior", office: "Front Office" },
  { name: "Iris", seniority: "Junior", office: "Back Office" }
].map(x => ({ id: uid("p"), locked: false, pinnedGroupId: null, ...x }));

// ----------------------------
// UI Components (minimal + fun)
// ----------------------------
function Badge({ children }) {
  return (
    <span className="px-2 py-0.5 text-xs rounded-full bg-slate-100 text-slate-700 border border-slate-200">
      {children}
    </span>
  );
}

function Switch({ checked, onChange }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`inline-flex items-center w-12 h-6 rounded-full transition-all ${checked ? "bg-emerald-500" : "bg-slate-300"}`}
    >
      <span className={`bg-white w-5 h-5 rounded-full shadow transform transition-all ${checked ? "translate-x-6" : "translate-x-1"}`} />
    </button>
  );
}

// ----------------------------
// Self-tests (basic runtime checks)
// ----------------------------
function runSelfTests() {
  const rng = mulberry32(hashStringToSeed("test-seed"));
  const settings = { groupSize: 3, minSeniorsPerGroup: 1, requireOfficeMix: true };
  const pre = precheckConstraints(DEMO_PARTICIPANTS, settings);
  if (!pre.ok) throw new Error("Precheck failed unexpectedly in self-test");
  const groups = buildGroups(DEMO_PARTICIPANTS, settings, rng);
  // Test 1: group names present
  if (!groups.every(g => g.name && typeof g.name === "string")) throw new Error("Group naming failed");
  // Test 2: at least one Senior in each group (since feasible with demo data)
  if (!groups.every(g => g.members.some(m => m.seniority === "Senior"))) throw new Error("Senior rule not satisfied");
  // Test 3: FO/BO mix satisfied where group size >= 2
  if (!groups.every(g => g.members.length < 2 || (g.members.some(m => m.office === "Front Office") && g.members.some(m => m.office === "Back Office")))) {
    throw new Error("Office mix rule not satisfied");
  }
  return "All self-tests passed";
}

// ----------------------------
// Main App
// ----------------------------
export default function App() {
  const [participants, setParticipants] = useState(/** @type {Designer[]} */(DEMO_PARTICIPANTS));
  const [name, setName] = useState("");
  const [seniority, setSeniority] = useState(/** @type {Seniority} */("Medior"));
  const [office, setOffice] = useState(/** @type {Office} */("Front Office"));

  const [groupSize, setGroupSize] = useState(3);
  const [minSeniorsPerGroup, setMinSeniorsPerGroup] = useState(1);
  const [requireOfficeMix, setRequireOfficeMix] = useState(true);

  const [seedText, setSeedText] = useState(() => `${Date.now()}`);
  const rng = useMemo(() => mulberry32(hashStringToSeed(seedText)), [seedText]);

  const [groups, setGroups] = useState(/** @type {Group[]} */([]));
  const [lastError, setLastError] = useState("");
  const [selfTestMsg, setSelfTestMsg] = useState("");

  const settings = useMemo(() => ({ groupSize, minSeniorsPerGroup, requireOfficeMix }), [groupSize, minSeniorsPerGroup, requireOfficeMix]);
  const precheck = useMemo(() => precheckConstraints(participants, settings), [participants, settings]);

  function addParticipant() {
    if (!name.trim()) return;
    setParticipants(p => [...p, { id: uid("p"), name: name.trim(), seniority, office, locked: false, pinnedGroupId: null }]);
    setName("");
  }

  function removeParticipant(id) {
    setParticipants(p => p.filter(x => x.id !== id));
  }

  function toggleLock(id) {
    setParticipants(p => p.map(x => x.id === id ? { ...x, locked: !x.locked } : x));
  }

  function generate(useSameSeed = true) {
    setLastError("");
    const compute = (rngInstance) => {
      const check = precheckConstraints(participants, settings);
      if (!check.ok) { setLastError(check.reason || "Invalid settings"); return; }
      const g = buildGroups(participants, settings, rngInstance, groups);
      setGroups(g);
    };

    if (useSameSeed) {
      compute(rng);
    } else {
      const newSeed = `${Date.now()}`;
      setSeedText(newSeed);
      compute(mulberry32(hashStringToSeed(newSeed)));
    }
  }

  function handleImport(text) {
    try {
      let data;
      if (text.trim().startsWith("{")) {
        const json = JSON.parse(text);
        if (Array.isArray(json)) {
          data = json;
        } else if (Array.isArray(json.designers)) {
          data = json.designers;
        } else {
          throw new Error("JSON must be an array or { designers: [] }");
        }
        const mapped = data.map(x => ({ id: uid("p"), locked: false, pinnedGroupId: null, name: x.name, seniority: x.seniority || "Medior", office: x.office || "Front Office" }));
        setParticipants(mapped);
      } else {
        const rows = parseCSV(text);
        const mapped = rows.map(x => ({ id: uid("p"), locked: false, pinnedGroupId: null, name: x.name, seniority: /** @type {Seniority} */(x.seniority || "Medior"), office: /** @type {Office} */(x.office || "Front Office") }));
        setParticipants(mapped);
      }
    } catch (e) {
      alert("Import error: " + (e && e.message ? e.message : String(e)));
    }
  }

  function exportAll(fmt) {
    if (!groups.length) { alert("Generate groups first."); return; }
    if (fmt === "text") download("groups.txt", exportText(groups));
    if (fmt === "csv") download("groups.csv", exportCSV(groups));
    if (fmt === "json") download("groups.json", JSON.stringify({ groups }, null, 2));
  }

  function onRunSelfTests() {
    try {
      const msg = runSelfTests();
      setSelfTestMsg(msg);
    } catch (err) {
      setSelfTestMsg("Self-tests failed: " + (err && err.message ? err.message : String(err)));
    }
  }

  // Derived badges
  const seniorCount = participants.filter(p => p.seniority === "Senior").length;
  const foCount = participants.filter(p => p.office === "Front Office").length;
  const boCount = participants.filter(p => p.office === "Back Office").length;

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-slate-50 text-slate-800">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <header className="flex items-center justify-between mb-6">
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Designer Group Shuffler</h1>
          <div className="flex items-center gap-3">
            <button onClick={() => generate(true)} className="px-4 py-2 rounded-2xl bg-slate-900 text-white shadow hover:scale-[1.02] transition">Generate</button>
            <button onClick={() => generate(false)} className="px-4 py-2 rounded-2xl bg-white border shadow hover:scale-[1.02] transition">Reseed & Shuffle</button>
          </div>
        </header>

        {/* Controls Grid */}
        <div className="grid md:grid-cols-3 gap-4 mb-8">
          <section className="p-4 rounded-2xl bg-white shadow-sm border">
            <h2 className="font-medium mb-3">Add Designer</h2>
            <div className="flex flex-col gap-3">
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Name" className="border rounded-xl px-3 py-2" />
              <div className="grid grid-cols-2 gap-2">
                <select value={seniority} onChange={e => setSeniority(/** @type {Seniority} */(e.target.value))} className="border rounded-xl px-3 py-2">
                  <option>Junior</option>
                  <option>Medior</option>
                  <option>Senior</option>
                </select>
                <select value={office} onChange={e => setOffice(/** @type {Office} */(e.target.value))} className="border rounded-xl px-3 py-2">
                  <option>Front Office</option>
                  <option>Back Office</option>
                </select>
              </div>
              <button onClick={addParticipant} className="px-3 py-2 rounded-xl bg-slate-900 text-white">Add</button>
            </div>

            <details className="mt-4">
              <summary className="cursor-pointer text-sm text-slate-600">Import CSV/JSON</summary>
              <textarea id="importBox" className="mt-2 w-full h-28 border rounded-xl p-2 text-sm" placeholder={`CSV headers: name,seniority,office\nAlice,Senior,Front Office`}/>
              <div className="mt-2 flex gap-2">
                <button className="px-3 py-1.5 rounded-xl bg-white border" onClick={() => handleImport(document.getElementById("importBox").value)}>Import</button>
                <button className="px-3 py-1.5 rounded-xl bg-white border" onClick={() => setParticipants(DEMO_PARTICIPANTS)}>Load Demo</button>
              </div>
            </details>
          </section>

          <section className="p-4 rounded-2xl bg-white shadow-sm border">
            <h2 className="font-medium mb-3">Rules & Settings</h2>
            <div className="space-y-3">
              <label className="flex items-center justify-between">
                <span>Group size</span>
                <input type="number" min={2} value={groupSize} onChange={e => setGroupSize(Math.max(2, Number(e.target.value)))} className="w-20 border rounded-xl px-3 py-1.5 text-right" />
              </label>
              <label className="flex items-center justify-between">
                <span>Min Seniors per group</span>
                <input type="number" min={0} value={minSeniorsPerGroup} onChange={e => setMinSeniorsPerGroup(Math.max(0, Number(e.target.value)))} className="w-20 border rounded-xl px-3 py-1.5 text-right" />
              </label>
              <label className="flex items-center justify-between">
                <span>Require FO + BO mix</span>
                <Switch checked={requireOfficeMix} onChange={setRequireOfficeMix} />
              </label>
              <label className="flex items-center justify-between">
                <span>Random seed</span>
                <input value={seedText} onChange={e => setSeedText(e.target.value)} className="w-48 border rounded-xl px-3 py-1.5 text-right" />
              </label>
              <div className="text-xs text-slate-500">Tip: change the seed for a different but reproducible shuffle.</div>
            </div>

            <div className="mt-4 text-sm bg-slate-50 border rounded-xl p-3">
              <div className="flex flex-wrap gap-2">
                <Badge>{participants.length} people</Badge>
                <Badge>{seniorCount} Seniors</Badge>
                <Badge>{foCount} FO</Badge>
                <Badge>{boCount} BO</Badge>
              </div>
              {precheck.ok ? (
                <div className="mt-2 text-emerald-700">Ready to generate.</div>
              ) : (
                <div className="mt-2 text-rose-700">{precheck.reason}</div>
              )}
              <div className="mt-3 flex gap-2">
                <button onClick={onRunSelfTests} className="px-3 py-1.5 rounded-xl bg-white border">Run Self-Tests</button>
                {selfTestMsg && <span className="text-xs text-slate-600">{selfTestMsg}</span>}
              </div>
            </div>
          </section>

          <section className="p-4 rounded-2xl bg-white shadow-sm border">
            <h2 className="font-medium mb-3">Export</h2>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => exportAll("text")} className="px-3 py-2 rounded-xl bg-white border">Text</button>
              <button onClick={() => exportAll("csv")} className="px-3 py-2 rounded-xl bg-white border">CSV</button>
              <button onClick={() => exportAll("json")} className="px-3 py-2 rounded-xl bg-white border">JSON</button>
            </div>

            <h2 className="font-medium mt-6 mb-3">People</h2>
            <div className="max-h-64 overflow-auto pr-1">
              {participants.map(p => (
                <div key={p.id} className="flex items-center justify-between py-1.5 border-b last:border-b-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{p.name}</span>
                    <Badge>{p.seniority}</Badge>
                    <Badge>{p.office === "Front Office" ? "FO" : "BO"}</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => toggleLock(p.id)} className={`px-2 py-1 rounded-lg border ${p.locked ? "bg-emerald-50 border-emerald-300" : "bg-white"}`}>{p.locked ? "🔒" : "🔓"}</button>
                    <button onClick={() => removeParticipant(p.id)} className="px-2 py-1 rounded-lg border">🗑️</button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {lastError && (
          <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800">{lastError}</div>
        )}

        {/* Groups Output */}
        <section>
          <h2 className="font-medium mb-3">Groups</h2>
          {groups.length === 0 ? (
            <div className="p-6 border rounded-2xl bg-white text-slate-500">No groups yet. Click <span className="font-medium">Generate</span>.</div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {groups.map((g) => (
                <div key={g.id} className="rounded-2xl bg-white border shadow-sm p-4 hover:shadow transition">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-lg font-semibold">{g.name}</div>
                    <div title={g.constraintOK ? "Constraints satisfied" : "Constraint not met"}>
                      {g.constraintOK ? <span className="text-emerald-600">✓</span> : <span className="text-rose-600">!</span>}
                    </div>
                  </div>
                  <ol className="space-y-2">
                    {g.members.map(m => (
                      <li key={m.id} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span>{m.name}</span>
                          <Badge>{m.seniority}</Badge>
                          <Badge>{m.office === "Front Office" ? "FO" : "BO"}</Badge>
                          {m.locked && <Badge>Locked</Badge>}
                        </div>
                      </li>
                    ))}
                  </ol>
                  <div className="mt-3 text-xs text-slate-500">
                    {g.members.length} / {groupSize} members
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <footer className="mt-10 text-xs text-slate-500">
          Built with ❤️ — Minimal & fun. Tip: lock key people, tweak the seed, and reshuffle to explore balanced mixes.
        </footer>
      </div>
    </div>
  );
}
