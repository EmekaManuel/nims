# Nims demo: voice-over script

Timed to the ElevenLabs voice used for `nims-demo.mp4` (98.7 s). **279 words.** The picture follows the audio: each scene lasts as long as its line plus a short pause, and the footage is sped up or slowed slightly to match, so a different voice (yours, or ElevenLabs) re-times itself. Put your takes in `video/public/vo/<scene>.mp3`, run `node measure.mjs`, and render.

| Start | End | Length | On screen | Say |
|---|---|---|---|---|
| 0:00.50 | 0:12.25 | 11.7 s | Hook: spreadsheet economy, then living merchants | In most games, the economy is a spreadsheet. Prices never move. Nobody is really trading. Nims is a town where every merchant is an AI agent, with its own money and its own mind about prices. |
| 0:13.10 | 0:22.34 | 9.2 s | Email sign-in | You sign in with an email. That's all. No wallet, no seed phrase, no gas: the game makes your account and pays every fee behind the scenes. |
| 0:23.15 | 0:26.54 | 3.4 s | Goal picker | Pick a goal. Nim, your guide, always says what to do next. |
| 0:27.35 | 0:31.11 | 3.8 s | Collecting cotton | Buy cotton at the wholesaler, then carry it to a stall that pays more. |
| 0:31.92 | 0:40.23 | 8.3 s | Merchant explains the price | Every price has a reason. Hover it, and the merchant explains in plain words: how much stock they hold, who sold to them this hour, and what they can afford. |
| 0:40.97 | 0:45.10 | 4.1 s | Sale, cash lands | Sell, and the cash lands instantly. The game never waits for a block. |
| 0:45.88 | 0:54.99 | 9.1 s | Delivery order placed | Too far to walk? Place a delivery order: the goods, and the lowest price you'll take. The town's carriers wait for that price, then sell the load for you. |
| 0:55.73 | 0:57.82 | 2.1 s | Order filled | And there it is. Sold, with no walking. |
| 0:58.62 | 1:02.61 | 4.0 s | Price board | The price board shows every good in every market, against its usual price. |
| 1:03.42 | 1:07.78 | 4.4 s | Merchant shares | You can even own a piece of a merchant, and earn a share of their profit each evening. |
| 1:08.63 | 1:18.57 | 9.9 s | Fast-forward week | Because every merchant reacts to the others, one trader flooding the market crashes a price for everyone. No scripted event. No developer patch. That is the economy as the gameplay. |
| 1:19.53 | 1:28.31 | 8.8 s | Live NEAR testnet contract | And it's all real. Every good is a token on NEAR testnet, settled in batches by a relayer, so you never see a wallet. Here is the live contract. |
| 1:29.37 | 1:37.35 | 8.0 s | Outro | Nims. Agent merchants. Email login. NEP-245 goods. Delivery orders in the spirit of NEAR Intents. The economy is the game. |

## Reading notes
- Don't read numbers off the screen; the callouts show them.
- Keep each line within about 10% of its length for the tightest fit; longer lines just add a held frame.
- The chain scene shows real numbers read from the live testnet contract (`node chain-snapshot.mjs` refreshes them before a render).
- "Delivery orders in the spirit of NEAR Intents" is deliberate: they are not the Intents protocol (see README).
