# Judge walk-through (about 5 minutes)

A 100-second, 1080p video made with Remotion (source in [../video](../video)): a hook, sign-in, a first sale, the merchant explaining its price in its own words, a delivery order, prices, shares, the one-week fast-forward, and a scene with real numbers read from the live NEAR testnet contract. [nims-demo.mp4](nims-demo.mp4) is narrated; [VOICEOVER.md](VOICEOVER.md) has the script and the time of every line.

**Judging targets:** a tight, readable loop where the economy *is* the gameplay; and a player who never notices the chain.

Start with `npm run dev` ([README](../README.md)). Everything works without any setup or accounts.

## 1. The economy on its own (60 seconds)

Open the **Fast-forward a week** link on the login screen (or add `#sim` to the address). No login.

- A week plays back over about 12 seconds. **Pause** or drag the slider, and **hover any chart**: one tooltip lists every series, and the crosshair follows across all of them.
- **Prices against the usual price** (top row). In the Scrap & Hardware chart, iron falls to about 30% of its usual price on day 1 and stays there. That's the market flooder dumping goods on the merchants.
- Untick **Market flooder** and press **Fast-forward a week** again. Iron no longer crashes. *This is the economy being the gameplay: one trader's behaviour moves the whole market.*
- **How much cash each shop holds.** In the default week, Mira's Greens runs out of cash on day 6 (✕), and the investor's community fund reopens the shop (✓).
- **What happened** lists shocks (rain, fuel queue, festive season), closures, reopenings and dividends in words.
- Every chart has **Show table** if you'd rather read numbers.

Say: *"Every price here comes from the same `merchants/pricing.ts` the game uses. There's no second copy of the economy."*

## 2. Playing it (2 minutes)

Go back to the game (**Back to the game**), sign in with any email, and pick **Build a fortune** when asked.

1. Read Nim's **next step** (top left). It points at the best deal right now. **Show me on the map** puts a **NEXT** marker on it. The tabs along the bottom (Deals, Prices, My business, News) open panels on the right.
2. Collect iron at the scrap spot, then tap **Anil Metals** and **hover a price**. The merchant answers in their own words: *"I'm holding 62 iron and I only want 50, so I'll pay less…"*
3. Sell. Then **flood Ruth's Salvage**: collect and sell iron to them a few times. Watch the crates pile up on the map, the price fall, and the iron row on the price board turn blue (▼ cheap). Other markets stay unaffected.
4. Notice the game feel: coins float up from the stall you sold to, your avatar and vehicle stand in the market you're in, traders walk the roads, and your **rank** (top right) climbs as you earn. Spend profit on a pickup (top bar) to carry three times as much.

## 3. Ownership (1 minute)

- Tap a merchant and look at **Own a piece**. Buy a few shares. Every evening they pay out a cut of the day's profit.
- Tap a **closed** stall (the shutters are down). **Put in** some money to its **community fund**. When the fund fills, the shop reopens and your name goes on its sign.
- Tap a **free plot** on the map to open your own stall. Set your prices, stock it, put cash in the till. Merchants in that market will trade with you.
- Leave the tab alone for a couple of minutes and come back: **Welcome back** shows what happened while you were away.

## 4. The chain you never see (1 minute)

Nothing above showed a wallet, a seed phrase, a signature or a gas prompt. Your email created an account, and a relayer pays gas.

To prove the chain side (needs a testnet `.env`, see the README):

```bash
npx tsx server/run-live-check.ts 30
```

It plays 30 game hours and streams them to NEAR testnet, where every merchant and player signs its own transfers, goods and coins alike. It ends with *"OK: all N balances on the chain match the game."* Everything lives in one NEP-245 contract, `oja-items.testnet`. When the server runs with credentials it does this continuously in the background; open **News** in the game for the link to your own account on the public ledger.

## If something goes wrong

- **Blank page or "market is closed":** the game server isn't running. Use `npm run dev`, not `npm run web`.
- **Fast-forward says "try again in a second":** runs are spaced out; press the button again.
- **Want a fresh game:** stop the server, delete `server/data/game.json`, start it again.
- **No testnet credentials:** the game and dashboard work fully; only step 4 needs them.

## Where to look in the code

- `merchants/pricing.ts`: the pricing rule, with the reasoning lines the tooltips show
- `sim/engine.ts`: trades, shocks, closures, community funds, shares, dividends
- `sim/fastforward.ts`: the headless week
- `contracts/items/src/lib.rs`: the NEP-245 contract
- `server/rounds.ts`: how self-signed settlements stay in a safe order
