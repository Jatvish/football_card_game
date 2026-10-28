# Final Whistle

A complete browser-based football strategy card duel, with online private rooms and a solo practice opponent. Built with Node 20+ and vanilla JavaScript; no third-party runtime dependencies or build step.

## Run

```sh
npm start
# Open http://localhost:3000
npm test
npm run simulate -- 500
```

Choose **Full tactical match** or **Penalties only** on the home screen. Both modes support private rooms and Coach AI practice. For a two-person game, create a room and share its link. Each browser tab keeps its own session, so two tabs can also test a match. Refresh resumes that tab's match. Practice uses the same server rules as multiplayer.

## Implemented rules

- 50 distinct peak-version cards. Each squad contains 3 forwards, 3 midfielders, 4 defenders and 2 keepers. No duplicates across squads. Total OVR and each category's OVR gap are at most 8.
- A server coin toss decides the first attacker. Twelve alternating possessions; six attacks and six defences each.
- Three uses per card, with a **must-play constraint**: if a card has as many uses left as eligible turns remaining, it must play now. This guarantees all 36 uses per squad can be spent without a deadlocked final turn.
- Explicit Finisher, Creator and Runner roles; mandatory two defenders plus goalkeeper. Natural-role modifiers, formation bonus, curated teammate chemistry, centre-back/full-back shape, marker matchups and goalkeeper matchup.
- Each card has a special ability. Managers choose activations before revealing. Each activation consumes its one use even if the trigger fails. Conditions are visible in the card inspector.
- Both lineups remain secret until committed. The defender then assigns two different markers. One attacker stays unmarked. Both players review the full result before the next possession.
- Full-time ties and the Penalties only mode use alternating kicks, early clinching, then sudden death. On each kick the shooter commits a taker and aim; the defender commits a keeper and dive. Resolve that single kick, review the result, then swap roles. Five attempts each; sudden-death wins require equal attempts. All six takers must be used before reuse. Normal charges and abilities are suspended. Penalties are probabilistic; normal possessions are deterministic.
- Full match journal, searchable card collection, attribute/ability inspector, chemistry explanations, lineup suggestion, rematch, mobile layout and reconnect handling.

## Scoring contract

`public/engine.js` is the pure shared rules implementation. Browser previews and the server use the same functions. The server validates and resolves every action.

Attack = 0.40 Finisher + 0.35 Creator + 0.25 Runner + chemistry (cap 4) + shape + attack abilities.

Defence = 0.275 Defender 1 + 0.275 Defender 2 + 0.45 Keeper + chemistry (cap 2) + shape + defence abilities.

Role stat weights and natural-position modifiers are displayed in the in-game playbook. The marker comparisons depend on the marked role; finisher duels include aerial and physical attributes. The goalkeeper matchup compares 60% finishing + 40% composure to 60% reflexes + 40% positioning, divided by 10 and capped at ±2. Marker terms, keeper term and matchup abilities sum to one modifier capped at ±6.

Margin = attack − defence + matchup, rounded to three decimal places to remove floating-point tie noise. A positive margin scores; zero favours defence. No bonus is counted twice. UI scores round to one decimal; the journal/API retains three decimals.

Penalty stat advantage = (0.55 FIN + 0.45 COM − 0.55 REF − 0.45 GK_POS)/200. A correct dive gives goal chance clamp(0.15 + advantage, 0.05, 0.25): 85% save chance at equal stats, bounded at 75–95%. A different dive gives goal chance clamp(0.76 + advantage, 0.25, 0.95). The result and kick history show both goal and save probabilities. The server uses cryptographic randomness. One kick resolves only after the shooter and defender commit their role-specific choice. Both managers acknowledge its result before the next kick; hidden directions are never exposed before resolution.

## Data

Ratings, OVR and peak versions are hand-authored **gameplay estimates**, not official or empirically validated football statistics. OVR is a squad-deal label; individual attributes decide gameplay. New cards have distinct profiles rather than copied attribute templates. All 50 cards include locally bundled Wikimedia photos with six prominent attributes. Author, original source and license are visible in each card inspector and recorded in `PHOTO_CREDITS.md`. Photos may show a different season from the fictional peak rating. Photo licenses apply independently of game code; images were resized and converted to WebP. To refresh assets, run `python scripts/fetch-player-photos.py` with Pillow installed. No image network requests are needed during gameplay.

Chemistry is a limited curated set of shared senior-team windows, independent of peak-card season. Missing links score zero; it is not a complete career/appearance database. Source examples are recorded in `data/players.json`. In particular, the [2007–08 Barcelona squad](https://players.fcbarcelona.com/en/chronology/2007), [2009–10 squad](https://players.fcbarcelona.com/en/chronology/2009), and [PSG's 2021–22 season review](https://www.psg.fr/equipes/equipe-premiere/content/2022-paris-puissance-10) support the corresponding curated groups. Chemistry strengths are design values, not measured partnership statistics.

## Verification

`npm test` checks formulas, zero-margin outcomes, matchup counters, ability triggers, illegal selections, hidden information, exhaustion, 1,000 balanced drafts, 500 complete matches, alternating penalty choices, result acknowledgement, early clinching/sudden death, penalty-only rooms/rematches, bot play, all 50 local portraits with credits, and the complete two-client HTTP lifecycle. `scripts/simulate.js` runs legal greedy lineups and best defensive marking to report scoring and first-attacker outcomes. These are regression/balance checks, not a substitute for human playtesting.

## Render

The existing `render.yaml` remains compatible: Node runtime, `npm install`, `npm start`, and `/health`. The server honours `PORT`. Deploy this revision using the connected Render service's branch setting (normally `main`). `/health` returns `version: "2.1"` to distinguish the new deployment.

Use **one server instance**. Rooms are in memory: a restart/deploy clears active matches, and rooms expire after two hours without authenticated activity. Persistent accounts, cross-restart recovery, horizontal scaling, ranking and tournaments are not implemented. Session tokens live in sessionStorage per tab and are sent only in POST bodies, never invitation links. Mutations reject stale match/turn identifiers, cross-origin browser requests, oversized bodies, and unauthorized players. Room creation is bounded, but internet-scale abuse protection and persistent storage require separate infrastructure.
