# Nims demo: voice-over script

Timed to the ElevenLabs voice used for `nims-demo.mp4` (99.8 s). **279 words.** The picture follows the audio: each scene lasts as long as its line plus a short pause, and the footage is sped up or slowed slightly to match, so a different voice (yours, or ElevenLabs) re-times itself. Put your takes in `video/public/vo/<scene>.mp3`, run `node measure.mjs`, and render.

| Start | End | Length | On screen | Say |
|---|---|---|---|---|
| 0:00.50 | 0:12.20 | 11.7 s | Hook: spreadsheet economy, then living merchants | In most games, the economy is a spreadsheet. Prices never move. Nobody is really trading. Nims is a town where every merchant is an AI agent, with its own money and its own mind about prices. |
| 0:13.07 | 0:20.45 | 7.4 s | Email sign-in | You sign in with an email. That's all. No wallet, no seed phrase, no gas: the game makes your account and pays every fee behind the scenes. |
| 0:21.25 | 0:24.55 | 3.3 s | Goal picker | Pick a goal. Nim, your guide, always says what to do next. |
| 0:25.35 | 0:29.58 | 4.2 s | Collecting cotton | Buy cotton at the wholesaler, then carry it to a stall that pays more. |
| 0:30.38 | 0:39.25 | 8.9 s | Merchant explains the price | Every price has a reason. Hover it, and the merchant explains in plain words: how much stock they hold, who sold to them this hour, and what they can afford. |
| 0:40.00 | 0:44.09 | 4.1 s | Sale, cash lands | Sell, and the cash lands instantly. The game never waits for a block. |
| 0:44.88 | 0:53.57 | 8.7 s | Delivery order placed | Too far to walk? Place a delivery order: the goods, and the lowest price you'll take. The town's carriers wait for that price, then sell the load for you. |
| 0:54.33 | 0:56.56 | 2.2 s | Order filled | And there it is. Sold, with no walking. |
| 0:57.35 | 1:02.04 | 4.7 s | Price board | The price board shows every good in every market, against its usual price. |
| 1:02.85 | 1:08.19 | 5.3 s | Merchant shares | You can even own a piece of a merchant, and earn a share of their profit each evening. |
| 1:09.03 | 1:19.81 | 10.8 s | Fast-forward week | Because every merchant reacts to the others, one trader flooding the market crashes a price for everyone. No scripted event. No developer patch. That is the economy as the gameplay. |
| 1:20.77 | 1:29.36 | 8.6 s | Live NEAR testnet contract | And it's all real. Every good is a token on NEAR testnet, settled in batches by a relayer, so you never see a wallet. Here is the live contract. |
| 1:30.47 | 1:38.18 | 7.7 s | Outro | Nims. Agent merchants. Email login. NEP-245 goods. Delivery orders in the spirit of NEAR Intents. The economy is the game. |

## Reading notes
- Don't read numbers off the screen; the callouts show them.
- Keep each line within about 10% of its length for the tightest fit; longer lines just add a held frame.
- The chain scene shows real numbers read from the live testnet contract (`node chain-snapshot.mjs` refreshes them before a render).
- "Delivery orders in the spirit of NEAR Intents" is deliberate: they are not the Intents protocol (see README).
