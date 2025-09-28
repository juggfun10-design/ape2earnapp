// /worker/bananaWorker.ts
/* Node 18+ runtime (long-lived process) — no node-fetch needed
   PUBLIC-SAFE VERSION: endpoints/keys/addresses come ONLY from env. */

const CYCLE_MINUTES = Number(process.env.CYCLE_MINUTES || 5);

// === REQUIRED RUNTIME CONFIG (all via env; no hardcoded secrets/addresses) ===
const TRACKED_MINT   = (process.env.TRACKED_MINT || "").trim();          // e.g. coin mint
const REWARD_WALLET  = (process.env.REWARD_WALLET || "").trim();         // program/treasury wallet
const TOKENS_PER_APE = Number(process.env.TOKENS_PER_APE || 100_000);

const HELIUS_RPC =
  (process.env.HELIUS_RPC || "").trim() ||
  (process.env.HELIUS_API_KEY ? `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}` : "");

const ADMIN_SECRET  = (process.env.ADMIN_SECRET || "").trim();
const ADMIN_OPS_URL = (process.env.ADMIN_OPS_URL || "").trim();          // e.g. https://<your-domain>/api/admin/ops

// Abstract external service so the exact provider isn’t obvious in public code.
// In private, set these to your real base + paths.
const EXTERNAL_API_BASE = (process.env.EXTERNAL_API_BASE || "").trim();  // e.g. https://<provider-domain>
const EXTERNAL_API_KEY  = (process.env.EXTERNAL_API_KEY  || "").trim();  // bearer/api-key
const PATH_CLAIM_SWAP   = (process.env.PATH_CLAIM_SWAP   || "").trim();  // e.g. /v1/creator/claim-swap
const PATH_AIRDROP_SPL  = (process.env.PATH_AIRDROP_SPL  || "").trim();  // e.g. /v1/airdrop/spl

// --- sanity checks (fail fast in private, soft in public) ---
if (!HELIUS_RPC) throw new Error("Missing HELIUS_RPC / HELIUS_API_KEY");
if (!TRACKED_MINT || !REWARD_WALLET) {
  console.warn("[bananaWorker] TRACKED_MINT / REWARD_WALLET not set — worker will no-op.");
}
if (!EXTERNAL_API_BASE || !EXTERNAL_API_KEY || !PATH_CLAIM_SWAP || !PATH_AIRDROP_SPL) {
  console.warn("[bananaWorker] External API config missing — claim/swap/airdrop will no-op.");
}
if (!ADMIN_SECRET || !ADMIN_OPS_URL) {
  console.warn("[bananaWorker] Admin ops wiring missing — UI ops readout will be empty.");
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }
class RetryableError extends Error {}

// ---------------- External API helper (idempotent + backoff) ----------------
function jitter(ms: number) { return ms + Math.floor(Math.random() * 200); }
function isRetryableStatus(status: number) { return status === 429 || status >= 500; }
function looksTransient(msg: string) {
  return /rate ?limit|timeout|temporar(?:ily)? unavailable|gateway|network|ECONNRESET|ETIMEDOUT/i.test(msg);
}

async function callExternal<T>(
  path: string,
  body: any,
  idemKey: string,
  attempts = 3
): Promise<{ res: Response; json: T | any }> {
  if (!EXTERNAL_API_BASE || !EXTERNAL_API_KEY) throw new Error("Missing external API creds");
  let lastErr: any;
  for (let i = 0; i < attempts; i++) {
    try {
      const url = new URL(path, EXTERNAL_API_BASE).toString();
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${EXTERNAL_API_KEY}`,   // can also support ?api-key= in env if needed
          "Idempotency-Key": idemKey,
        },
        body: JSON.stringify(body),
      });
      const text = await res.text();
      let json: any = {};
      try { json = text ? JSON.parse(text) : {}; } catch {}
      if (res.ok) return { res, json };

      const msg = String(json?.message || json?.error || `HTTP ${res.status}`);
      if (isRetryableStatus(res.status) || looksTransient(msg)) {
        await sleep(jitter(500 * (i + 1)));
        continue;
      }
      throw new Error(msg);
    } catch (e: any) {
      lastErr = e;
      await sleep(jitter(500 * (i + 1)));
    }
  }
  throw lastErr;
}

// ---- JSON-RPC to Helius ----
async function rpc(method: string, params: any[], attempts = 6): Promise<any> {
  let last: any;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(HELIUS_RPC, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: method, method, params }),
      });
      const txt = await res.text();
      const json = txt ? JSON.parse(txt) : {};
      if (!res.ok || json?.error) {
        const msg = json?.error?.message || `HTTP ${res.status}`;
        if (res.status === 429 || res.status >= 500 || /rate ?limit|too many/i.test(msg)) {
          throw new RetryableError(msg);
        }
        throw new Error(msg);
      }
      return json;
    } catch (e) {
      last = e;
      if (!(e instanceof RetryableError) || i === attempts - 1) break;
      await sleep(300 * (i + 1) + Math.random() * 200);
    }
  }
  throw last;
}

const coerce = (j: any) =>
  Array.isArray(j?.result) ? j.result : (Array.isArray(j?.result?.value) ? j.result.value : []);

// ---- cycle timing helpers ----
function floorCycleStart(d = new Date()) {
  const w = CYCLE_MINUTES * 60_000;
  return new Date(Math.floor(d.getTime() / w) * w);
}
function nextTimes() {
  const start = floorCycleStart();
  const end = new Date(start.getTime() + CYCLE_MINUTES * 60_000);
  return {
    id: String(start.getTime()),
    start,
    end,
    tMinus60: new Date(end.getTime() - 60_000),
    tMinus10: new Date(end.getTime() - 10_000),
  };
}
const apes = (bal: number) => Math.floor((Number(bal) || 0) / TOKENS_PER_APE);

// ---- chain helpers ----
async function getHoldersAll(mint: string) {
  async function scan(pid: string, with165: boolean) {
    const filters: any[] = [{ memcmp: { offset: 0, bytes: mint } }];
    if (with165) filters.unshift({ dataSize: 165 });
    const j = await rpc("getProgramAccounts", [
      pid,
      { encoding: "jsonParsed", commitment: "confirmed", filters },
    ]);
    const list = coerce(j);
    const out: Record<string, number> = {};
    for (const it of list) {
      const info = it?.account?.data?.parsed?.info;
      const owner = info?.owner;
      const amt = Number(info?.tokenAmount?.uiAmount ?? 0);
      if (!owner || !(amt > 0)) continue;
      out[owner] = (out[owner] ?? 0) + amt;
    }
    return out;
  }
  let merged: Record<string, number> = {};
  try {
    const a = await scan("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", true);
    for (const [k, v] of Object.entries(a)) merged[k] = (merged[k] ?? 0) + Number(v);
  } catch {}
  try {
    const b = await scan("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCx2w6G3W", false);
    for (const [k, v] of Object.entries(b)) merged[k] = (merged[k] ?? 0) + Number(v);
  } catch {}
  return Object.entries(merged)
    .map(([wallet, balance]) => ({ wallet, balance: Number(balance) }))
    .filter((r) => r.balance > 0);
}

async function rewardPoolBalance(mint: string, owner: string) {
  const j = await rpc("getTokenAccountsByOwner", [
    owner,
    { mint },
    { encoding: "jsonParsed", commitment: "confirmed" },
  ]);
  let total = 0;
  for (const it of coerce(j)) {
    const ta = it?.account?.data?.parsed?.info?.tokenAmount;
    const v = typeof ta?.uiAmount === "number" ? ta.uiAmount : Number(ta?.uiAmountString ?? 0);
    if (Number.isFinite(v)) total += v;
  }
  return total;
}

// ---- admin ops recording (for UI readout) ----
async function recordOps(partial: { lastClaim?: any; lastSwap?: any }) {
  if (!ADMIN_SECRET || !ADMIN_OPS_URL) return;
  try {
    await fetch(ADMIN_OPS_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-admin-secret": ADMIN_SECRET },
      body: JSON.stringify(partial),
    });
  } catch {}
}

// ---- T-1m: claim + swap 90% into BANANA (external service) ----
async function triggerClaimAndSwap90() {
  if (!EXTERNAL_API_BASE || !EXTERNAL_API_KEY || !PATH_CLAIM_SWAP || !TRACKED_MINT || !REWARD_WALLET) {
    return { ok: false, reason: "missing config" };
  }
  const cycleId = String(floorCycleStart().getTime());
  const { res, json } = await callExternal(
    PATH_CLAIM_SWAP,
    {
      mint: TRACKED_MINT,
      fromWallet: REWARD_WALLET,
      swapPercent: 0.90, // 90% of freshly-claimed rewards
      mode: "market",
    },
    `claim:${cycleId}`,
    3
  );

  const claimed = Number(json?.data?.claimed ?? json?.claimed ?? 0);
  const swapped = Number(json?.data?.swapped ?? json?.swapped ?? 0);
  const claimTx = json?.data?.claimTx || json?.claimTx || null;
  const swapTx  = json?.data?.swapTx  || json?.swapTx  || null;
  const now = new Date().toISOString();

  await recordOps({
    lastClaim: { at: now, amount: claimed, tx: claimTx },
    lastSwap:  { at: now, amount: swapped, tx: swapTx },
  });

  return { ok: res.ok, claimed, swapped, claimTx, swapTx };
}

// ---- T-10s: snapshot + distribute by APE (skip missing ATAs) ----
async function snapshotAndDistribute() {
  if (!EXTERNAL_API_BASE || !EXTERNAL_API_KEY || !PATH_AIRDROP_SPL || !TRACKED_MINT || !REWARD_WALLET) {
    return { ok: false, reason: "missing config" };
  }

  const holders = await getHoldersAll(TRACKED_MINT);
  const rows = holders
    .map((h) => ({ wallet: h.wallet, apes: apes(h.balance) }))
    .filter((r) => r.apes > 0);

  const totalApes = rows.reduce((a, r) => a + r.apes, 0);
  if (totalApes <= 0) return { ok: false, reason: "no apes" };

  const pool = await rewardPoolBalance(TRACKED_MINT, REWARD_WALLET);
  const perApe = Math.floor(pool / totalApes);
  if (!(pool > 0) || perApe <= 0) {
    return { ok: false, reason: "pool empty or per-ape too small", pool, totalApes };
  }

  const distributions = rows
    .map((r) => ({ wallet: r.wallet, amount: perApe * r.apes }))
    .filter((x) => x.amount > 0);

  const cycleId = String(floorCycleStart().getTime());
  const { res, json } = await callExternal(
    PATH_AIRDROP_SPL,
    {
      mint: TRACKED_MINT,
      fromWallet: REWARD_WALLET,
      distributions,
      priorityFee: "auto",
      skipMissingAta: true,
    },
    `airdrop:${cycleId}`,
    3
  );

  return { ok: res.ok, count: distributions.length, perApe, json };
}

// ---- main loop (self-scheduling worker) ----
async function loop() {
  const fired = new Set<string>();
  for (;;) {
    const { id, end, tMinus60, tMinus10 } = nextTimes();
    const now = new Date();

    if (!fired.has(id + ":claim") && now >= tMinus60) {
      try { await triggerClaimAndSwap90(); } catch {}
      fired.add(id + ":claim");
    }

    if (!fired.has(id + ":dist") && now >= tMinus10) {
      try { await snapshotAndDistribute(); } catch {}
      fired.add(id + ":dist");
    }

    if (now >= end) fired.clear();
    await sleep(1000);
  }
}

loop().catch((err) => {
  console.error("bananaWorker crashed:", err);
  process.exit(1);
});
