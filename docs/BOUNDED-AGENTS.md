# Bounded agents: let a model steer a business without letting it break the economy

Nims has eleven merchants, each run by an AI agent with its own money, stock and prices. This note describes the pattern that keeps that safe, in the order a team would build it, with the file that implements each step, so another game or agent app can reuse it. Everything here is in the repository and tested; nothing is a plan.

## The problem

Handing a language model real money is a trust problem, not an intelligence problem. A model can be wrong, can be talked into things, and can write plausible nonsense. If its output is allowed to move money or set prices directly, one bad reply is a bad day for the whole economy.

## The pattern: six rules

**1. The model chooses from a menu; it never writes a number.**
Each merchant's plan is a handful of words: for each good, hold `more`, `less` or the `same`, and price with a `wider`, `narrower` or the `same` margin, plus one sentence of reasoning. The game maps each word to a small fixed step: the stock target is x1.3, x0.75 or unchanged, and the margin moves by +0.03 or -0.03 and is then clamped to 5%–25%.
[`sim/plan.ts#L29-L32`](../sim/plan.ts#L29-L32) holds the table, [`#L35-L46`](../sim/plan.ts#L35-L46) applies it (`targetOf`, `paramsOf`).

**2. Anything outside the menu is ignored.**
A reply that is not JSON, names an unknown choice, or has no margin is dropped, and the merchant keeps the plan it had. Choices for a good the merchant does not trade are ignored. A failed or nonsensical reply is simply asked again later.
[`server/agents/planner.ts#L78-L104`](../server/agents/planner.ts#L78-L104) (`parsePlan`); tests [`planner.test.ts#L29-L37`](../server/agents/planner.test.ts#L29-L37) and [`#L73`](../server/agents/planner.test.ts#L73).

**3. Free text is checked against facts before anyone sees it.**
The model's one sentence is shown only if it is short, uses no forbidden word, and every number in it appears in the facts the model was given. Otherwise the game writes a plain sentence from the choices instead, and the choices still apply.
[`server/voice/llm.ts#L74`](../server/voice/llm.ts#L74) (`acceptLine`), [`#L27`](../server/voice/llm.ts#L27) (`FORBIDDEN`); test [`planner.test.ts#L24`](../server/agents/planner.test.ts#L24) (an invented number keeps the choices but replaces the sentence).

**4. The model sees only the merchant's own situation.**
The prompt holds the merchant's books, its prices against the usual ones, any shock in town and its market's council rules ([`planner.ts#L51-L57`](../server/agents/planner.ts#L51-L57)). It contains nothing about any player, and no player-typed text reaches any prompt (the plan, the price explanation, the gazette and the haggle reply are all built from the game's own facts).
[`planner.test.ts#L41`](../server/agents/planner.test.ts#L41), [`server/voice/no-player-text.test.ts#L21`](../server/voice/no-player-text.test.ts#L21) (plays a player with a typed name and business name, then checks every prompt), [`server/game/game.ts#L1350-L1353`](../server/game/game.ts#L1350-L1353) (the gazette's event allowlist).

**5. Money never passes through the model.**
Prices come from a plain function of stock, cash and recent trades ([`merchants/pricing.ts#L98`](../merchants/pricing.ts#L98), `quote`). The plan only nudges that function's inputs. Coins and goods move only through game actions, and every movement is written to a ledger that the chain mirrors. A test plays five players through every kind of action and checks that the ledger reproduces every coin and every good ([`sim/ledger-fuzz.test.ts`](../sim/ledger-fuzz.test.ts)).

**6. One small step per merchant per day, and the game never waits.**
Each open merchant plans once a day, one at a time, and steps never overlap. The game runs the same with the model switched off.
Tests: [`planner.test.ts#L54`](../server/agents/planner.test.ts#L54) (once a day), [`#L83`](../server/agents/planner.test.ts#L83) (steps never overlap), [`#L93`](../server/agents/planner.test.ts#L93) (plans survive a save, and player stalls are never planned for).

## What the bounds buy you, measured

Even when the model does the worst thing the menu allows, every merchant on the widest margin every day, the economy still works for a player. `npm run balance` plays a scripted trader over eight seeds at two action rates: 14 of 16 runs reach the 10,000-coin goal with normal margins, and 12 of 16 still do with `BALANCE_WIDER=1`, which puts every merchant on the widest margin ([`sim/balance.ts`](../sim/balance.ts)). The slowest worst-case run took about 33 real minutes. A model with no bounds could set any price.

## How another game would reuse it

1. **List what the agent may decide**, as words, not numbers (a menu of a few options per decision).
2. **Write the step table**: what each word does to the system, how big the step is, and the clamp it can never pass. Keep steps small on purpose.
3. **Parse strictly.** Accept only the menu words for things the agent really has. On anything else, keep the last plan. Never repair a reply by guessing.
4. **Check any free text** against the facts you gave the model, and fall back to text you write yourself.
5. **Give the agent only its own state.** Leave out user data and user text.
6. **Test hostile replies**: not JSON, unknown word, invented number, forbidden word, a good it does not trade, a reply that never arrives.

The same shape fits a treasury agent (hold more, hold less, same), a pricing agent, or a crew of agents that each get a budget.

## What it does not do

- It does not stop a model from choosing allowed-but-bad steps. It bounds how much harm those steps can do, and the measurement above is the check.
- It is not custody. Merchant and player keys are held by the server in Nims (disclosed in the README), and only the Town Clerk's key is held by OutLayer, with a policy set in OutLayer's dashboard. The pattern here limits what a model can decide, not who holds a key.
- The chain layer is separate. The chain mirrors the game's ledger in the background and never decides anything.
