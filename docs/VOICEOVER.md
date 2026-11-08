# Nims demo: voice-over script

Timed to the narration in `nims-demo.mp4` (143.2 s, **338 words**), spoken in a cloned ElevenLabs voice. The picture follows the audio: each scene lasts as long as its line plus a short pause, so a different voice (yours, or another) re-times itself. Put your takes in `video/public/vo/<scene>.mp3`, run `node measure.mjs` in `video/`, and render. See [video/README.md](../video/README.md).

The merchants' own lines are not part of the narration: they are real NEAR AI Cloud text, spoken by ElevenLabs, recorded by `video/scripts/play-session.ts`. The council vote in the video is also real: with the DAO configured, the same script writes it to the live SputnikDAO through the OutLayer-custodied Town Clerk. The DAO scene shows proposal #2, written that way by an earlier recording of this vote; the current recording ran with the DAO off so it would not file a duplicate. The merchants' plans in the video were made by NEAR AI during the recording, the same way the live server makes them.

The whole video is set at night, in the 3D town.

| Start | End | Length | On screen | Say |
|---|---|---|---|---|
| 0:00.50 | 0:12.30 | 11.8 s | Hook: a spreadsheet economy, then the town at night in 3D with living merchants | In most games, the economy is a spreadsheet. Prices never move. Nobody is really trading. Nims is a town where every merchant is an AI agent, with its own money and its own mind about prices. |
| 0:14.80 | 0:21.73 | 6.9 s | The loading animation, then the real sign-in screen (Google or email) | You sign in with Google, or an email. That's all. No wallet, no seed phrase, no gas: the game does the rest behind the scenes. |
| 0:24.23 | 0:30.60 | 6.4 s | The 3D town at night: collecting cotton at the wholesaler | It's festive season, so fabric is dear. Buy cotton at the wholesaler, and carry it to a stall that pays more. |
| 0:32.10 | 0:38.63 | 6.5 s | Hover a price: the merchant explains it, in a NEAR AI line, spoken | Every price has a reason. Hover it, and the merchant explains it in their own words, written live by NEAR AI.<br>*Then the merchant says (NEAR AI, voiced by ElevenLabs):* I only have 36 cotton and I like to keep 52, so it is dear. |
| 0:43.73 | 0:55.17 | 11.4 s | Lena's stall: Today's plan, decided by the merchant through NEAR AI (stocking up on cotton and thread for the festive season) | And every merchant runs its own business. Each morning it reads its books and decides, through NEAR AI, what to stock and how hard to price. Lena is stocking up for the festive season. |
| 0:56.87 | 1:01.83 | 5.0 s | Sell with a haggle: cash lands, the merchant answers back | Sell, and the cash lands instantly. Haggle, and the merchant answers back, in character.<br>*Then the merchant says (NEAR AI, voiced by ElevenLabs):* Lena's Textiles: “You drive a hard bargain, but for 5 cotton, I will pay 1328 coins each.” |
| 1:09.07 | 1:21.50 | 12.4 s | The town council: a regular votes to cut the rent, it passes at the end of the day | And the market belongs to its players. Trade in a market, and you get a seat on its council. Vote to cut the rent: the merchants agree, it passes at the end of the day, and the rules change. No patch. |
| 1:24.00 | 1:31.57 | 7.6 s | Out of coins: scrap heap, then an odd job | Run out of coins, and you're never stuck. Search the scrap heap, or take an odd job: a short merchant pays you to fetch goods for them. |
| 1:35.07 | 1:36.93 | 1.9 s | The Nims Gazette | The town even prints its own news. |
| 1:40.27 | 1:49.03 | 8.8 s | Fast-forward week: the real dashboard, drawn from a run of the real engine | Because every merchant reacts to the others, one trader flooding the market crashes a price for everyone. No script. No patch. That is the economy as the gameplay. |
| 1:50.87 | 1:59.70 | 8.8 s | Live NEAR testnet contract | And it's all real. Every good and coin is a token on NEAR testnet, settled in batches by a relayer, so you never see a wallet. Here is the live contract. |
| 2:00.70 | 2:11.30 | 10.6 s | The council vote recorded on a real SputnikDAO, signed by an OutLayer-custodied Town Clerk | Every council vote is also recorded on a SputnikDAO, signed by a Town Clerk whose key never leaves an OutLayer secure enclave. The game counts the votes. The chain remembers them. |
| 2:12.40 | 2:22.57 | 10.2 s | Outro: the night town behind the closing title | Nims. AI merchants, a player-run council, NEP-245 goods, a SputnikDAO record, and NEAR AI behind every voice. The economy is the game. |

## Reading notes
- Don't read numbers off the screen; the callouts show them.
- Keep each line within about 10% of its length for the tightest fit; longer lines just add a held frame.
- The chain scene shows real numbers read from the live testnet contract (`node chain-snapshot.mjs` refreshes them before a render).
