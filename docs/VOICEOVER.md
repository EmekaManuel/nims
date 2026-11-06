# Nims demo: voice-over script

Timed to the narration in `nims-demo.mp4` (103.6 s, **228 words**), spoken in a cloned ElevenLabs voice. The picture follows the audio: each scene lasts as long as its line plus a short pause, so a different voice (yours, or another) re-times itself. Put your takes in `video/public/vo/<scene>.mp3`, run `node measure.mjs` in `video/`, and render. See [video/README.md](../video/README.md).

The merchants' own lines are not part of the narration: they are real NEAR AI Cloud text, spoken by ElevenLabs, recorded by `video/scripts/play-session.ts`.

| Start | End | Length | On screen | Say |
|---|---|---|---|---|
| 0:00.50 | 0:12.30 | 11.8 s | Hook: a spreadsheet economy, then living merchants | In most games, the economy is a spreadsheet. Prices never move. Nobody is really trading. Nims is a town where every merchant is an AI agent, with its own money and its own mind about prices. |
| 0:14.80 | 0:21.73 | 6.9 s | The loading animation, then the real sign-in screen (Google or email) | You sign in with Google, or an email. That's all. No wallet, no seed phrase, no gas: the game does the rest behind the scenes. |
| 0:24.23 | 0:30.60 | 6.4 s | Collecting cotton at the wholesaler | It's festive season, so fabric is dear. Buy cotton at the wholesaler, and carry it to a stall that pays more. |
| 0:32.10 | 0:38.63 | 6.5 s | Hover a price: the merchant explains it, in a NEAR AI line, spoken | Every price has a reason. Hover it, and the merchant explains it in their own words, written live by NEAR AI.<br>*Then the merchant says (NEAR AI, voiced by ElevenLabs):* It is the festive season and everyone wants fabric right now. |
| 0:43.67 | 0:48.63 | 5.0 s | Sell with a haggle: cash lands, the merchant answers back | Sell, and the cash lands instantly. Haggle, and the merchant answers back, in character.<br>*Then the merchant says (NEAR AI, voiced by ElevenLabs):* Lena's Textiles: “You drive a hard bargain for those 5 cotton, but I am happy to pay 1173 coins each since you are a regular.” |
| 0:57.40 | 1:04.97 | 7.6 s | Out of coins: scrap heap, then an odd job | Run out of coins, and you're never stuck. Search the scrap heap, or take an odd job: a short merchant pays you to fetch goods for them. |
| 1:08.47 | 1:10.33 | 1.9 s | The Nims Gazette | The town even prints its own news. |
| 1:13.67 | 1:22.43 | 8.8 s | Fast-forward week | Because every merchant reacts to the others, one trader flooding the market crashes a price for everyone. No script. No patch. That is the economy as the gameplay. |
| 1:24.27 | 1:33.10 | 8.8 s | Live NEAR testnet contract | And it's all real. Every good and coin is a token on NEAR testnet, settled in batches by a relayer, so you never see a wallet. Here is the live contract. |
| 1:34.20 | 1:42.50 | 8.3 s | Outro | Nims. AI merchants, email login, NEP-245 goods, and NEAR AI behind every voice. The economy is the game. |

## Reading notes
- Don't read numbers off the screen; the callouts show them.
- Keep each line within about 10% of its length for the tightest fit; longer lines just add a held frame.
- The chain scene shows real numbers read from the live testnet contract (`node chain-snapshot.mjs` refreshes them before a render).
