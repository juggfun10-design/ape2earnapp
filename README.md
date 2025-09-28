# 🍌 Ape2Earn — The First Flywheel Airdrop Loop

<p align="center">
  <strong>Simple tech. Brutal rewards.</strong><br/>
  Become an Ape. Get fed in <code>$BANANA</code>. Repeat.
</p>

---

## 🔥 What is Ape2Earn?

Ape2Earn is a **provably fair, fully automated reward engine** built for the $BANANA community.  
Every **5 minutes**, the system:

1. Claims creator rewards (T−1m)  
2. Swaps **90%** of freshly claimed SOL into `$BANANA`  
3. Takes a snapshot (T−10s)  
4. Distributes `$BANANA` to eligible holders (APEs)

**1 APE = 100,000 $BANANA** — APEs determine your share of each drop.

---

## ⚡ Why it matters

- ⏱ **Automated cycles** — runs every 5 minutes  
- 💸 **Zero manual claims** — rewards are processed on-chain  
- 🔒 **Transparent & auditable** — snapshot + distribution logic is visible in the repo/UI  
- 🚫 **Anti-whale** — wallets over the configured cap (default 50M) are excluded

---

## 🛠 Architecture (high level)

- **Worker (Node)** — long-lived worker that:
  - Claims creator rewards
  - Swaps claimed SOL → $BANANA (via on-chain DEX or Jupiter)
  - Records ops for the UI
  - Snapshots holders and sends SPL airdrops
- **Frontend (Next.js)** — transparency dashboard showing latest claims, swaps, holders, and metrics
- **APIs**:
  - Snapshot endpoint (edge) — caches holders via Helius RPC
  - Admin ops endpoint — receives recorded ops (protected by `ADMIN_SECRET`)

---

## 📁 What we publish (open) vs hidden (private)

**Open / public (safe to show):**
- UI components, styles and animations
- Snapshot + metrics code (read-only logic)
- Airdrop distribution algorithm (how apes are computed)

**Hidden / redacted (do NOT publish):**
- Private keys / wallet secrets
- `PUMPORTAL_KEY`, `PUMPORTAL_URL` (or any third-party secret)
- `DEV_WALLET_PRIVATE_KEY`, `TREASURY_SECRET`, `ADMIN_SECRET`
- Any deploy/webhook URLs tied to private servers

> ✅ This README includes a `.env.example` (values redacted) so contributors know what to set locally.

---

## ⚙️ Quickstart (local, dev)

```bash
# clone
git clone https://github.com/<your-org>/ape2earn.git
cd ape2earn

# install
npm install

# dev
npm run dev

# build
npm run build
