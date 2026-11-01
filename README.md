# Final Whistle

A complete browser-based football strategy card duel, with online private rooms, Coach AI practice and a separate database-backed Ranked Club. Built with Node 20+ and vanilla JavaScript; the only runtime dependency is the PostgreSQL driver.

## Run

```sh
npm start
# Open http://localhost:3000
npm test
npm run simulate -- 500
```

Choose **Quick Match** (6 possessions, 2 uses per card and no forced rotation), **Tactical Match** (12 possessions and the original 3-use rotation), or **Penalties only**. Friendly modes support private rooms and Coach AI practice. A separate **Ranked Season** uses only the player's unlocked 12-card collection squad against Coach AI. For a two-person game, create a room and share its link. Each browser tab keeps its own session, so two tabs can also test a match. Refresh resumes that tab's match. Practice uses the same server rules as multiplayer.

## Implemented rules

- 50 distinct peak-version cards. Each squad contains 3 forwards, 3 midfielders, 4 defenders and 2 keepers. No duplicates across squads. Total OVR and each category's OVR gap are at most 8.
- A server coin toss decides the first attacker. Twelve alternating possessions; six attacks and six defences each.
- Tactical matches: three uses per card, with a **must-play constraint**: if a card has as many uses left as eligible turns remaining, it must play now. This guarantees all 36 uses per squad can be spent without a deadlocked final turn.
- Explicit Finisher, Creator and Runner roles; mandatory two defenders plus goalkeeper. During lineup selection, drag a pool card onto a role or drag filled role cards to swap positions. On touch screens, tap two filled roles to swap. Double-click / quickly tap a filled role twice to clear it; clicking an assigned pool card again also removes it. Natural-role modifiers, formation bonus, curated teammate chemistry, centre-back/full-back shape, marker matchups and goalkeeper matchup.
- Quick matches use a two-use cap with no must-play rotation, so players can repeat favourites. Tactical and Ranked matches retain three uses and the original rotation.
- Each card has a special ability. Managers choose activations before revealing. An activated ability is consumed when the possession resolves, whether its trigger succeeds or fails. Armed cards show an on-card status and expected bonus; resolved lineup slots and the replay show the exact `+2` / `+3` outcome or `NOT TRIGGERED · USED` beside the player.
- Both lineups remain secret until committed. The defender then assigns two different markers. One attacker stays unmarked. Both players review the full result before the next possession.
- Full-time ties and the Penalties only mode use alternating kicks, early clinching, then sudden death. On each kick the shooter commits a taker and aim; the defender commits a keeper and dive. Resolve that single kick, review the result, then swap roles. Five attempts each; sudden-death wins require equal attempts. All six takers must be used before reuse. Normal charges and abilities are suspended. Penalties are probabilistic; normal possessions are deterministic.
- Three Coach AI difficulties (Rookie, Pro, Legend), simplified match result summaries with expandable calculations, illustrated goal/save/block replays, visible ability bonuses above the player in the replay and result lineup, match journal, searchable collection, attribute/ability inspector, chemistry explanations, lineup suggestions, rematches, mobile layout and reconnect handling.
- Database-backed Ranked Club: account registration/sign-in, a 12-card starter collection, owned-card squad management (3 F / 3 M / 4 D / 2 GK), XP and manager levels, rating, win/loss record, win streaks, daily missions, daily prize wheel, player packs with animated three-card reveals, collection completion achievements, weekly leaderboard, Player of the Match, and per-card mastery XP/levels from appearances, goals, defensive stops and successful abilities.

## Scoring contract

`public/engine.js` is the pure shared rules implementation. Browser previews and the server use the same functions. The server validates and resolves every action.

Attack = 0.40 Finisher + 0.35 Creator + 0.25 Runner + chemistry (cap 4) + shape + attack abilities.

Defence = 0.275 Defender 1 + 0.275 Defender 2 + 0.45 Keeper + chemistry (cap 2) + shape + defence abilities.

Role stat weights and natural-position modifiers are displayed in the in-game playbook. The marker comparisons depend on the marked role; finisher duels include aerial and physical attributes. The goalkeeper matchup compares 60% finishing + 40% composure to 60% reflexes + 40% positioning, divided by 10 and capped at ±2. Marker terms, keeper term and matchup abilities sum to one modifier capped at ±6.

Margin = attack − defence + matchup, rounded to three decimal places to remove floating-point tie noise. A positive margin scores; zero favours defence. No bonus is counted twice. UI scores round to one decimal; the journal/API retains three decimals.

Penalty stat advantage = (0.55 FIN + 0.45 COM − 0.55 REF − 0.45 GK_POS)/200. A correct dive gives goal chance clamp(0.15 + advantage, 0.05, 0.25): 85% save chance at equal stats, bounded at 75–95%. A different dive gives goal chance clamp(0.76 + advantage, 0.25, 0.95). The result and kick history show both goal and save probabilities. The server uses cryptographic randomness. One kick resolves only after the shooter and defender commit their role-specific choice. Both managers acknowledge its result before the next kick; hidden directions are never exposed before resolution.

## Data

Ratings, OVR and peak versions are hand-authored **gameplay estimates**, not official or empirically validated football statistics. OVR is a squad-deal label; individual attributes decide gameplay. New cards have distinct profiles rather than copied attribute templates. All 50 cards include locally bundled Wikimedia photos with six prominent attributes. Author, original source and license are visible in each card inspector and recorded in `PHOTO_CREDITS.md`. Photos may show a different season from the fictional peak rating. Photo licenses apply independently of game code; images were resized and converted to WebP. To refresh assets, run `python scripts/fetch-player-photos.py` with Pillow installed. No image network requests are needed during gameplay.

Chemistry is generated by comparing every unordered pair among all 50 cards (1,225 checks) against month-level windows for shared senior club teams and senior national teams. Every overlapping pair receives a link; pairs without any shared window remain zero. Link strength is a game-design bonus (+1 for shorter overlap, +2 for 18+ months), not a measured player partnership. Source notes for the career windows are in `data/chemistry-sources.md`. The public references and career-gap handling are documented in `data/chemistry-sources.md`. Chemistry strengths are design values, not measured partnership statistics.

## Verification

`npm test` checks formulas, zero-margin outcomes, matchup counters, ability triggers and successful-trigger-only consumption, illegal selections, hidden information, exhaustion, 1,000 balanced drafts, 500 complete tactical matches, six-possession Quick matches, Ranked squad composition and result persistence, daily-spin/pack/mission/leaderboard/achievement UI, alternating penalty choices, result acknowledgement, early clinching/sudden death, penalty-only rooms/rematches, bot play, all 50 local portraits with credits, and the complete two-client HTTP lifecycle. `scripts/simulate.js` runs legal greedy lineups and best defensive marking to report scoring and first-attacker outcomes. These are regression/balance checks, not a substitute for human playtesting.

## Database-backed Ranked Club

The server uses PostgreSQL via the `pg` driver. Set `DATABASE_URL` to enable account registration/sign-in, owned card collections, Ranked squad validation, XP/levels, rating, records/streaks, daily missions, daily reward spins, pack inventory/openings, achievements, weekly leaderboard data, match MVPs and per-card mastery. Manager XP raises the Ranked level by one each time another 250 XP is earned; each level-up unlocks one random player card while locked cards remain. XP does not directly alter player attributes, match calculations or rating. The server applies `migrations/001_initial.sql` idempotently during startup. Daily spin and mission resets use `APP_TIME_ZONE` (defaults to `Asia/Kolkata`) so the reward day follows the configured product timezone. If `DATABASE_URL` is absent, Quick/Tactical/Penalties friendly modes still work; account and Ranked APIs return a clear 503 instead of pretending progress is persistent.

Passwords are stored as salted scrypt hashes. Session tokens are random, 30-day tokens stored hashed in the database. Ranked squads are validated server-side against the account's owned cards. Ranked rewards are written transactionally and are idempotent per match. Card mastery tracks Ranked appearances, goals, defensive stops and activated abilities.

## Deploy on Render with Neon Postgres

Recommended low-cost setup: keep the Node web service on Render and use Neon Postgres for persistent game data. Render's free Postgres databases expire after 30 days, so they are not a good home for a player collection or Ranked profile that should last. Neon Free currently includes 1 GB of Postgres storage per project, 100 CU-hours per project per month and 5 GB of public network transfer per project per month; compute scales to zero after 5 minutes of inactivity. This is a good fit for a small hobby-game prototype, but usage limits apply and the free tier is not a production SLA.

1. Create a free PostgreSQL project in Neon (Singapore is a practical region for players in India).
2. In Neon, open **Connect** and copy the pooled connection string (the hostname includes `-pooler`). Keep `sslmode=require` in the URL.
3. In the Render service for Final Whistle, open **Environment** and add `DATABASE_URL` with that connection string. Leave `PG_POOL_MAX` at `5` initially and set `APP_TIME_ZONE=Asia/Kolkata` for the daily reset.
4. Redeploy the Render service. At startup the app creates/updates the required tables. Check `/health`; it should return `database: true` and `version: "2.4"`.
5. Create a manager account in Final Whistle. Ranked, spins, packs, missions, achievements, card mastery and the weekly leaderboard are then account-backed across browsers/devices.

`render.yaml` declares `DATABASE_URL` with `sync: false` so the secret is added in Render's Environment UI rather than committed to Git. Never commit `.env` or a live database URL. `.env.example` shows the expected local-development variables. Local development can use the same Neon URL in a private `.env` file.

Use **one Render web-service instance** for now. Live match rooms remain in server memory: a restart/deploy clears active rooms, and rooms expire after two hours without activity. Ranked accounts, cards, XP, rating, rewards, mastery and match history persist in PostgreSQL. Ranked currently plays against Coach AI; online PvP ranked matchmaking is not included yet. The weekly leaderboard ranks managers who have completed Ranked matches.

Session tokens are kept by the browser and sent only in POST bodies, never invitation links. Mutations reject stale match/turn identifiers, cross-origin browser requests, oversized bodies and unauthorized players. The included room-creation rate cap is a basic safeguard; a public competitive launch should add distributed rate limiting, stronger abuse monitoring, automated backups and a proper matchmaking service.