# Chemistry timeline sources and methodology

This file records the public references used to check the club and senior-international windows for the 50 cards. The game does not claim that its small card set contains every footballer a player has ever shared a dressing room with; it checks **all 1,225 unordered pairs inside this 50-card collection** against the windows recorded in `data/players.json`.

## Career-window sources

- FC Barcelona, [Legendary Players](https://www.fcbarcelona.com/en/club/history/legendary-players) — club biographies and joining context for Barcelona players.
- TeleStats, [Barcelona appearance leaders and season spans](https://telestats.net/teams/barcelona/) — season spans for Messi, Xavi, Busquets, Iniesta, Piqué, Puyol, Alba, ter Stegen, Dani Alves, Suárez and Neymar.
- TeleStats, [Real Madrid appearance leaders and season spans](https://telestats.net/teams/real-madrid/) — season spans for Cristiano Ronaldo, Ramos, Benzema, Modrić, Marcelo, Kroos, Carvajal and Bale.
- Real Madrid, [Cristiano Ronaldo club history](https://www.realmadrid.com/en-US/the-club/history/football-legends/cristiano-ronaldo-dos-santos-aveiro) and [Jude Bellingham career profile](https://www.realmadrid.com/en-US/football/squad/jude-bellingham) — official career periods.
- Real Madrid, [official first-team squad](https://www.realmadrid.com/en-US/football/first-team/players), plus its [3 June 2024 Mbappé signing announcement](https://www.realmadrid.com/es-ES/noticias/futbol/primer-equipo/actualidad/comunicado-oficial-mbappe-03-06-2024) — confirmation that Mbappé joined the same first team as Bellingham from 2024.
- Reuters, [Real Madrid sign Mbappé on 3 June 2024](https://www.reuters.com/sports/soccer/real-madrid-sign-mbappe-free-transfer-2024-06-03/) — transfer timing and the first-team overlap with Bellingham.
- Paris Saint-Germain, [Achraf Hakimi player profile](https://www.psg.fr/en/players/achraf-hakimi) — PSG signing in July 2021 and Morocco senior-team career from 2016.
- 11v11, [Liverpool Premier League appearance records](https://www.11v11.com/teams/liverpool/tab/stats/option/appearances/) — first and latest Liverpool appearances for Salah, Van Dijk, Alisson and Alexander-Arnold.
- 11v11, [Manchester City Premier League appearance records](https://www.11v11.com/teams/manchester-city/tab/stats/option/appearances/) — first and latest appearances for Walker, Dias and Haaland; Kevin De Bruyne's club period is also cross-checked against the [StatBunker City appearances table](https://www.statbunker.com/alltimestats/AllTimeAppearances?club_id=14&comp_code=EPL).
- RSSSF, [France senior international records](https://www.rsssf.org/miscellaneous/fran-recintlp.html) — first and last senior caps for Henry, Zidane, Benzema, Mbappé, Varane, Pogba and Kanté.
- Fédération Française de Football, [Karim Benzema match log](https://www.fff.fr/equipe-nationale/joueur/8732-benzema-karim/fiche.html) — confirms his return in 2021 and final France appearances in June 2022; the data deliberately records separate 2007–2015 and 2021–2022 windows.
- Reuters, [Messi announces Argentina retirement on 31 August 2026](https://www.reuters.com/sports/soccer/messi-announces-departure-argentina-national-team-2026-08-31/) — closes his senior Argentina window in August 2026.
- Manchester United, [Casemiro to leave at the end of the 2025–26 season](https://www.manutd.com/en/news/casemiro-to-leave-man-utd-at-the-end-of-the-2025-26-season) — closes his United window in June 2026.
- Premier League, [Kyle Walker joins AC Milan on loan, 24 January 2025](https://www.premierleague.com/en/news/4230969/kyle-walker-joins-ac-milan-on-loan) and BBC Sport, [Walker signs for Burnley, 5 July 2025](https://www.bbc.co.uk/sport/football/articles/cn5kq5k96vdo) — dates the end of his Manchester City first-team period in January 2025.
- 11v11, [Spain senior international appearance records](https://www.11v11.com/teams/spain/tab/stats/option/appearances/) — shared senior windows for Xavi, Iniesta, Busquets, Piqué, Puyol, Ramos, Carvajal and Alba.
- DFB, [Germany record international players](https://datencenter.intg-dfb.de/datencenter/mannschaft/deutschland/rekord-spieler) — Neuer and Kroos senior international dates.
- RSSSF, [Brazil senior international records](https://www.rsssf.org/miscellaneous/braz-recintlp.html) — Neymar, Dani Alves and Ronaldinho senior-team windows.
- RSSSF, [Portugal senior international records](https://www.rsssf.org/miscellaneous/port-recintlp.html) — Cristiano Ronaldo's senior-team window.
- RSSSF, [Italy senior international records](https://www.rsssf.org/miscellaneous/ital-recintlp.html) — Buffon, Maldini and Pirlo senior-team dates.
- La Gazzetta dello Sport, [Maldini and Pirlo's Milan overlap](https://www.gazzetta.it/en/football/national-team/14-07-2026/pirlo-for-italy-maldini-s-influence-and-the-milan-connection.shtml) — confirms they were AC Milan teammates from 2001 until Maldini retired in 2009, while not overlapping for Italy.
- RSSSF, [England senior international records](https://www.rsssf.org/miscellaneous/eng-recintlp.html) — Rooney, Gerrard and Walker senior-team endpoints.
- The FA, [Jude Bellingham profile](https://www.thefa.com/england/mens-seniors/squad/jude-bellingham) and [Wayne Rooney profile](https://www.thefa.com/england/mens-seniors/squad/wayne-rooney) — England senior debut context.

## Pair-generation rules

- `connections` entries use `YYYY-MM` inclusive month boundaries and are tagged as either `club` or `national`.
- Two cards have a link only when they share the same club or senior national team and their month ranges overlap.
- Multiple overlaps between the same pair are all retained in the reason text, but the pair receives only one chemistry bonus.
- The bonus is a balancing rule: +1 for a shorter shared period and +2 when the longest overlap is at least 18 months. It is not a claim that the players had a measured on-pitch partnership.
- A player who joined a club after another player's departure does not receive a link merely because their tenures touch the same calendar year. For example, Toni Kroos and Robert Lewandowski are not linked for Bayern: Kroos's Bayern period ended before Lewandowski's first-team period began.
- The test suite independently recomputes all 1,225 pairs from the recorded windows and fails for either a missing overlap or an unsupported link.
