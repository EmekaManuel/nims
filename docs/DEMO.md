# Judge walk-through (about 5 minutes)

A 132-second, 1080p narrated video made with Remotion (source in [../video](../video)), set at night in the 3D town and drawn from the real game screen and engine, not a screen recording: sign-in, buying cotton in the festive season, hovering a price to hear a merchant explain it (a NEAR AI line, spoken in its own voice), winning a haggle and hearing the merchant's reaction, a town council vote that cuts a market's rent, running out of coins and getting back up through the scrap heap and an odd job, the town gazette, the one-week fast-forward, a scene with real numbers read from the live NEAR testnet contract, and the council vote recorded on a real SputnikDAO by an OutLayer-custodied Town Clerk. [nims-demo.mp4](nims-demo.mp4) is the narrated cut; [VOICEOVER.md](VOICEOVER.md) has the script and the time of every line.

**Judging targets:** a tight, readable loop where the economy *is* the gameplay; and a player who never notices the chain.

Start with `npm run dev` ([README](../README.md)). Everything works without any setup or accounts.

## 1. The economy on its own (60 seconds)

Open the **Fast-forward a week** link on the login screen (or add `#sim` to the address). No login.

- A week plays back over about 12 seconds. **Pause** or drag the slider, and **hover any chart**: one tooltip lists every series, and the crosshair follows across all of them.
- **Prices against the usual price** (top row). In the Scrap & Hardware chart, iron falls to about 30% of its usual price on day 1 and stays there. That's the market flooder dumping goods on the merchants.
- Untick **Market flooder** and press **Fast-forward a week** again. Iron no longer crashes. *This is the economy being the gameplay: one trader's behaviour moves the whole market.*
- **How much cash each shop holds.** In the default week every shop stays open (the highlights say so). The squeeze shows in Ruth's Salvage and Diego Hardware, which dip to about 10,000 to 12,000 of the 20,000 coins they start with while the flooder dumps iron on them. Wholesalers charge relative to the going price and the merchants' guild tops up shops running low, so a shop closing is now rare. The **Players** chart shows the flooder, who paid for what it dumps, sinking from 60,000 coins to a few hundred before it recovers a little.
- **What happened** lists shocks (rain, fuel queue, festive season), dividends and, if any, closures and reopenings in words.
- Every chart has **Show table** if you'd rather read numbers.

Say: *"Every price here comes from the same `merchants/pricing.ts` the game uses. There's no second copy of the economy."*

## 2. Playing it (2 minutes)

Go back to the game (**Back to the game**), sign in with any email, and pick **Build a fortune** when asked.

1. Read Nim's **next step** (top left). It points at the best deal right now. **Show me on the map** puts a **NEXT** marker on it. The tabs along the bottom (Deals, Prices, My business, News) open panels on the right.
2. Collect iron at the scrap spot, then tap **Anil Metals** and **hover a price**. The merchant answers in their own words: *"I'm holding 62 iron and I only want 50, so I'll pay less…"*
3. Sell. Then **flood Ruth's Salvage**: collect and sell iron to them a few times. Watch the crates pile up on the map, the price fall, and the iron row on the price board turn blue (▼ cheap). Other markets stay unaffected.
4. Notice the game feel: coins float up from the stall you sold to, your avatar and vehicle stand in the market you're in, traders walk the roads, and your **rank** (top right) climbs as you earn. Spend profit on a pickup (top bar) to carry three times as much, and haul cheaper: a fare to carry goods to another market is 3% of what they are worth, 70% of that in a pickup, 50% in a van.
5. Press **3D view** on the map. The same town in 3D: stalls with real goods in the crates, shopkeepers, townsfolk who walk the paved paths and stop in front of stalls, night and rain. Click a stall to open the same panel. **2D map** switches back.

## 3. Ownership (1 minute)

- Tap a merchant and look at **Own a piece**. Buy a few shares. Every evening they pay out a cut of the day's profit, on the shares you held since the day began (so nobody can buy at 10pm to collect and sell). The price is fair both ways: buying and selling straight back loses at most a coin or two.
- Tap a **closed** stall (the shutters are down). **Put in** some money to its **community fund**. When the fund fills, the shop reopens and your name goes on its sign.
- Tap a **free plot** on the map to open your own stall. Set your prices, stock it, put cash in the till. Merchants in that market will trade with you.
- Leave the tab alone for a couple of minutes and come back: **Welcome back** shows what happened while you were away.

## 3b. The town council (2 minutes)

Run with `TICK_MS=1000 npm run dev` so a game day passes in about 25 seconds.

1. Sell one unit to any merchant in the Produce Market. You are now a regular there, which gives you a seat on its council (each share you own adds another).
2. Open **My business → Town council → Produce Market**. Press **Low** under **Stall rent**. The merchants back a cut, so it passes when the vote closes in the evening. The tally shows your seats against the merchants' (they oppose a rise, so a rise needs many shares behind it).
3. When it closes the **News** tab reports the result and the market's rent changes from the next day. Extra rent, when voted in, is paid to shareholders each evening. No dev patch: the shareholders changed the rules.

## 4. The chain you never see (1 minute)

Nothing above showed a wallet, a seed phrase, a signature or a gas prompt. Your email created an account, and a relayer pays gas.

To prove the chain side (needs a testnet `.env`, see the README):

```bash
npx tsx server/scripts/run-live-check.ts 30
npm run chain:dao -- proposals     # the council votes recorded on the SputnikDAO (needs SPUTNIK_DAO_ID)
npm run chain:outlayer -- check    # the OutLayer-custodied Town Clerk's address, balance and policy
```

It plays 30 game hours and streams them to NEAR testnet, where every merchant and player signs its own transfers, goods and coins alike. It ends with *"OK: all N balances on the chain match the game."* Everything lives in one NEP-245 contract, `oja-items.testnet`. When the server runs with credentials it does this continuously in the background; open **News** in the game for the link to your own account on the public ledger.

## If something goes wrong

- **Blank page or "market is closed":** the game server isn't running. Use `npm run dev`, not `npm run web`.
- **Fast-forward says "try again in a second":** runs are spaced out; press the button again.
- **Want a fresh game:** stop the server, delete `server/data/game.json`, start it again.
- **No testnet credentials:** the game and dashboard work fully; only step 4 needs them.

## Where to look in the code

- `merchants/pricing.ts`: the pricing rule, with the reasoning lines the tooltips show
- `sim/engine.ts`: trades, shocks, closures, community funds, shares, dividends, fares, upkeep and the merchants' guild
- `sim/council.ts`: the town council (seats, votes, rent and payout rules)
- `server/chain/dao.ts`, `server/chain/outlayer.ts`: the council record on a SputnikDAO and the OutLayer-custodied Town Clerk that signs it
- `web/src/game/Map3D.tsx`, `web/src/game/paths.ts`: the 3D town and its walkways (tested to stay clear of buildings)
- `sim/fastforward.ts`: the headless week
- `contracts/items/src/lib.rs`: the NEP-245 contract
- `server/chain/rounds.ts`: how self-signed settlements stay in a safe order
