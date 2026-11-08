# Nims demo: voice-over script

Timed to the narration in `nims-demo.mp4` (132.1 s, **304 words**), spoken in a cloned ElevenLabs voice. The picture follows the audio: each scene lasts as long as its line plus a short pause, so a different voice (yours, or another) re-times itself. Put your takes in `video/public/vo/<scene>.mp3`, run `node measure.mjs` in `video/`, and render. See [video/README.md](../video/README.md).

The merchants' own lines are not part of the narration: they are real NEAR AI Cloud text, spoken by ElevenLabs, recorded by `video/scripts/play-session.ts`. The council vote in the video is also real: the same script writes it to the live SputnikDAO through the OutLayer-custodied Town Clerk, and the DAO scene shows that proposal.

The whole video is set at night, in the 3D town.

| Start | End | Length | On screen | Say |
|---|---|---|---|---|
| 0:00.50 | 0:12.30 | 11.8 s | Hook: a spreadsheet economy, then the town at night in 3D with living merchants | In most games, the economy is a spreadsheet. Prices never move. Nobody is really trading. Nims is a town where every merchant is an AI agent, with its own money and its own mind about prices. |
| 0:14.80 | 0:21.72 | 6.9 s | The loading animation, then the real sign-in screen (Google or email) | You sign in with Google, or an email. That's all. No wallet, no seed phrase, no gas: the game does the rest behind the scenes. |
| 0:24.23 | 0:30.60 | 6.4 s | The 3D town at night: collecting cotton at the wholesaler | It's festive season, so fabric is dear. Buy cotton at the wholesaler, and carry it to a stall that pays more. |
| 0:32.10 | 0:38.65 | 6.5 s | Hover a price: the merchant explains it, in a NEAR AI line, spoken | Every price has a reason. Hover it, and the merchant explains it in their own words, written live by NEAR AI.<br>*Then the merchant says (NEAR AI, voiced by ElevenLabs):* The festive season means everyone wants fabric right now, so I sell at 1406 coins. |
| 0:45.70 | 0:50.67 | 5.0 s | Sell with a haggle: cash lands, the merchant answers back | Sell, and the cash lands instantly. Haggle, and the merchant answers back, in character.<br>*Then the merchant says (NEAR AI, voiced by ElevenLabs):* Lena's Textiles: “You drive a hard bargain, but for 5 cotton, 1173 coins is a fair deal.” |
| 0:58.00 | 1:10.45 | 12.4 s | The town council: a regular votes to cut the rent, it passes at the end of the day | And the market belongs to its players. Trade in a market, and you get a seat on its council. Vote to cut the rent: the merchants agree, it passes at the end of the day, and the rules change. No patch. |
| 1:12.93 | 1:20.50 | 7.6 s | Out of coins: scrap heap, then an odd job | Run out of coins, and you're never stuck. Search the scrap heap, or take an odd job: a short merchant pays you to fetch goods for them. |
| 1:24.00 | 1:25.86 | 1.9 s | The Nims Gazette, with a headline about the council vote | The town even prints its own news. |
| 1:29.20 | 1:37.98 | 8.8 s | Fast-forward week: the real dashboard, drawn from a run of the real engine | Because every merchant reacts to the others, one trader flooding the market crashes a price for everyone. No script. No patch. That is the economy as the gameplay. |
| 1:39.80 | 1:48.62 | 8.8 s | Live NEAR testnet contract | And it's all real. Every good and coin is a token on NEAR testnet, settled in batches by a relayer, so you never see a wallet. Here is the live contract. |
| 1:49.63 | 2:00.22 | 10.6 s | The council vote recorded on a real SputnikDAO, signed by an OutLayer-custodied Town Clerk | Every council vote is also recorded on a SputnikDAO, signed by a Town Clerk whose key never leaves an OutLayer secure enclave. The game counts the votes. The chain remembers them. |
| 2:01.33 | 2:11.50 | 10.2 s | Outro: the night town behind the closing title | Nims. AI merchants, a player-run council, NEP-245 goods, a SputnikDAO record, and NEAR AI behind every voice. The economy is the game. |

## Reading notes
- Don't read numbers off the screen; the callouts show them.
- Keep each line within about 10% of its length for the tightest fit; longer lines just add a held frame.
- The chain scene shows real numbers read from the live testnet contract (`node chain-snapshot.mjs` refreshes them before a render).
