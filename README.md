🍌 Ape2Earn — The First Flywheel Airdrop Loop

Simple tech. Brutal rewards.
Become an Ape. Get fed in $BANANA. Repeat.

🔥 What is Ape2Earn?

Ape2Earn is a provably fair, fully automated reward engine built for the $BANANA community.
Every 5 minutes, the protocol captures creator rewards, swaps them into $BANANA, and redistributes them to holders — no buttons to press, no claims to chase, no middleman.

It’s a flywheel airdrop loop:
Creator rewards claimed at T−1m
90% swapped into $BANANA
Snapshot taken at T−10s
BANANA airdropped to all eligible Apes

⚡ Why It Matters

⏱ Automated Cycles — every 5 minutes like clockwork
💸 Zero Manual Claims — rewards hit your wallet, not a website button
🔒 Provably Fair — snapshot + distribution logic is fully transparent
🦍 APE Units — 1 APE = 100,000 $BANANA. Your APEs define your cut.
🚫 No Spam / Bots — wallets with >50M $BANANA are blacklisted from snapshots

🛠 Under the Hood

Snapshot Engine — runs on Solana RPC (Helius) with retries + caching
Buyback Pool — creator rewards are automatically recycled into $BANANA
Airdrop Worker — idempotent, skips missing ATAs, and distributes instantly
Transparency Panel — latest claims, swaps, and metrics displayed live
Note: Core logic (claim, swap, distribution) is wired to backend workers.
Open-sourced UI and helper code is for transparency, not for copy-pasting our infra.

🖥 Frontend Features

Real-time Market Cap tracking (via Birdeye API)
Apelist leaderboard — ranks all wallets by $BANANA balance → APEs
Next Drop countdown — live animated timer synced with distribution cycle
Fully pixel-style UI with 🍌 vibes

⚙️ Dev Setup

Clone the repo and install:

git clone https://github.com/<your-org>/ape2earn.git
cd ape2earn
npm install


Run locally:

npm run dev


Build:

npm run build

🌍 Live App

👉 https://ape2earn.xyz

📢 Disclaimer

This repo is partially open-sourced for transparency.
Sensitive configs (wallets, RPC endpoints, admin secrets) are not included.
Do not attempt to reuse the infra — it’s custom-wired and will not work without hidden pieces.

🦍 Join the Movement

Follow @banana4apes
 on X

Visit the app: ape2earn.xyz

Let’s build the strongest Ape flywheel in Solana. 🍌