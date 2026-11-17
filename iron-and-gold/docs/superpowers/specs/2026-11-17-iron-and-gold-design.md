# Iron & Gold — Design

*Working title. Date: 2026-11-17.*

## Intent

A single-player grand strategy game, played mostly on iPhone and iPad, that also runs on PC. It mixes two games the owner loves:

- **OpenFront.io** for the map and the fighting: borders that creep tile by tile in real time, a troop pool you send with an attack slider, buildings shown as icons on the map, trade ships you can watch and raid.
- **Victoria 3** for everything around the fighting: buildings that each do something different, trade, diplomacy with diplomatic plays, power blocs, puppets, companies and charters, research, laws and interest groups, and national statistics (GDP, population, standard of living).

The economy is deliberately light: "big number go up, with strategy involved". The fun is in choosing what to build where, which trade to protect, which laws to pass and when to go to war — not in managing a spreadsheet.

The owner plays alone against the AI for now. Online multiplayer comes later and the game is built so it can be added without a rewrite.

## Goals

1. Comfortable, native-feeling play on iPhone (landscape) and iPad; PC works with mouse and keyboard.
2. A competent AI with five difficulty levels.
3. Victoria-style buildings shown OpenFront-style, each with a distinct job; a trade network with piracy.
4. OpenFront-style battles; Victoria-style diplomacy.
5. Power blocs with principles (buffs), puppets, companies and charters.
6. Economic and social statistics: GDP, population, standard of living (SoL), literacy, treasury, income and more.
7. Two start dates: **1776** and **1836**. Later start dates (Napoleonic Wars, WW1, WW2) must be addable as data.
8. Paradox-style research.
9. Laws, interest groups and revolts.
10. Country-specific history events (the Great Game, German unification, the American Revolution, …).

## Non-goals (for now)

- Online multiplayer (later; the architecture must allow it — see Constraints).
- Start dates other than 1776 and 1836 (later; must be data-only additions).
- App Store distribution.
- A deep economy simulation (individual pops, production methods per building, detailed market clearing).

## Anti-goals (failure even if it technically works)

- **No nukes**, or any nuke-like weapon, ever.
- Fiddly on a phone: tiny tap targets, anything that needs hover, controls under the Dynamic Island or home bar.
- An economy that feels like a spreadsheet.
- An AI that is obviously dumb, or that cheats without saying so.
- A phone that overheats or stutters on the world map.
- Breaking the owner's existing FNaFb co-op mod or its phone site in this repo.

## Constraints

- **Platform:** a web game (TypeScript), installable to the iOS/iPadOS Home Screen as a full-screen, offline-capable web app. Must run in iOS Safari (current and previous major version) and desktop Chrome, Edge, Safari and Firefox.
- **Repo:** the game lives in its own folder, `iron-and-gold/`, in this repo. Do not modify the FNaFb mod (`main.js`, `version.json`) or the existing files in `docs/`.
- **Hosting:** the repo's GitHub Pages site serves `docs/`. The game's built output goes to `docs/iron/` so it is served at `<pages-site>/iron/`. The existing FNaFb service worker has scope `docs/` and passes non-`game/` requests through network-first; the game registers its **own** service worker with scope `./` from `docs/iron/` (a more specific scope, so it wins for `/iron/`). The game shares an origin with the FNaFb site, so all its storage (IndexedDB database names, localStorage keys, Cache Storage names) must be prefixed `iron-and-gold-` to avoid collisions. Publishing to the live site requires merging to `main`; that is the owner's call.
- **Performance:** steady 60 fps map rendering on an iPhone 12-class device and on iPad; the simulation must keep up at the fastest speed. Rendering uses the GPU (WebGL); the simulation runs in a Web Worker, off the main thread.
- **Multiplayer-ready:** the simulation is a deterministic function of (state, player commands, tick). No `Math.random` (use a seeded RNG stored in the game state), no wall-clock time, no non-deterministic iteration order, and no transcendental math (`Math.sin`, `Math.exp`, …) in simulation code (they are not guaranteed identical across devices). All player and AI actions enter the simulation as serializable commands. This is what OpenFront-style lockstep multiplayer will need later.
- **Content as data:** countries, start dates, states, buildings, techs, laws, principles, companies and events are data files, not code, so new start dates and events can be added without touching the engine.

## Approaches considered

1. **Web game added to the Home Screen (chosen).** One codebase for iPhone, iPad and PC; instant updates; no Mac, no App Store, no Apple developer fee; matches how the owner's FNaFb phone site already works, and OpenFront itself proves tile-by-tile world maps run in a browser. Costs: no App Store presence; Safari quirks; needs WebGL + a Web Worker to stay fast.
2. **Godot, exported to iOS and PC.** More raw speed and an App Store-style app, but installing on iPhone needs a Mac, Xcode and a $99/year developer account, and every update must be rebuilt and reinstalled.
3. **Native Swift app.** Most iOS-like, but PC would be a second game written from scratch.

The owner picked 1.

## The game, as decided

### Sessions and pacing

- Real time with **pause and three speeds**. Games last **2–4 hours**, played in chunks.
- Each start date runs **100 years** (1776→1876, 1836→1936). At speed 2 one in-game year takes about 2 real minutes (speed 1 ≈ 3 minutes, speed 3 ≈ 1 minute), so a full game at speed 2 is about 3⅓ hours. *(Exact tick rate is the builder's call; these real-time targets are fixed.)*
- **Autosave** every in-game year and whenever the app goes to the background (`visibilitychange`), to IndexedDB. Plus manual save slots.
- **Ending:** at the end date, a score screen ranks countries by a score combining GDP, population, SoL and land. A player who holds **50% of the world's land tiles** wins early. *(The 50% threshold and the score weights are the builder's call.)*
- The player can pick **any country**.

### Map

- The real world, whole globe, as a grid of small land/sea tiles (OpenFront-style), on the order of 2,000–2,500 tiles wide. Borders move tile by tile.
- The land is also divided into **named states** (Bavaria, Silesia, Punjab, …), several hundred worldwide, built from public-domain map data (Natural Earth admin-1, merged/simplified). A state's population, resources and building slots belong to **whoever holds most of its tiles**. Treaties, claims and events refer to states.
- Each start date assigns states to countries. Remote areas (inner Africa, the American West, Siberia, …) start as **unclaimed land** that anyone can take just by expanding into it, without diplomacy (this is colonisation).
- Terrain per tile: plains, forest, hills, mountains, desert, plus rivers. Terrain affects attack speed and defense.
- History may be simplified where it gets fiddly.

### Economy ("big number go up")

- **Money plus 8 goods:** grain, wood, coal, iron, textiles, tools, arms, luxuries.
- Each state has resources (e.g. coal, iron) that decide which buildings it can hold, and a number of building slots.
- **Every building does one distinct job.** Minimum set:

| Building | Job |
|---|---|
| Farm | produces grain |
| Logging camp | produces wood |
| Coal mine | produces coal (needs coal deposit) |
| Iron mine | produces iron (needs iron deposit) |
| Textile mill | grain → textiles |
| Tool workshop | wood + iron → tools |
| Arms factory | iron + tools → arms |
| Luxury workshop | wood + textiles → luxuries |
| Port | enables trade routes and ships (coastal states) |
| Shipyard | builds warships and transports (coastal) |
| Barracks | faster troop refill |
| Fort | defense bonus for tiles in the state |
| University | research points |
| Railway | boosts output of all buildings in the state; faster troop refill |
| Government office | raises tax income from the state |

- Buildings cost money and take time to build. They employ population; a state can't run more buildings than it has workers for.
- Goods go into a national stockpile; shortages raise prices and slow buildings that need them; surpluses can be exported.
- **GDP** = value of everything produced. **Income** = taxes on GDP (rate set by the tax law) + trade income − army upkeep − building upkeep.
- **Standard of living** depends on whether people get grain, textiles and luxuries (and welfare/education laws). Higher SoL → faster population growth. More population → more workers and a bigger troop pool.
- **Literacy** rises with education laws and universities; it boosts research.
- *(Exact formulas and numbers are the builder's call, tuned so growth feels good and choices matter.)*

### Trade and piracy

- Ports trade with other ports. A trade route moves a surplus good from an exporter to an importer; **both sides earn money**.
- Trade routes need: both countries have ports, are not at war, and no embargo. Trade agreements and shared power blocs boost trade income.
- **Trade ships are visible** sailing along sea lanes, like OpenFront.
- **Piracy:** warships automatically attack and capture enemy trade ships (countries you're at war with), taking the cargo as money. A country can also issue **privateer licenses** to raid ships of countries it has Hostile relations with, at an infamy cost. Warships can also be set to **escort** your own routes.

### Fighting (OpenFront)

- Each country has **one troop pool**. It refills over time; refill is faster with more population, barracks and railways, and needs a supply of **arms** (shortage slows refill and weakens attacks).
- **Attack:** tap a neighbour (or unclaimed land) and set the **attack slider** — the share of your troops to send. The front advances tile by tile; attackers and defenders lose troops; terrain, rivers and forts slow attackers.
- **Ships:** transports carry troops across water for naval invasions; warships fight, escort and raid.
- **During a war, captured tiles are occupied**, not owned. The peace deal decides which states change hands; all other occupied tiles go back to their owner.

### Diplomacy (Victoria 3)

- **No surprise attacks** on another country. To get something from a country you start a **diplomatic play**: pick a demand (take a state, make them a puppet, force them into your power bloc, open their market, take reparations). A countdown runs while other countries pick sides. The target gives in or war starts.
- **War score** comes from occupied states and battles won. The peace deal gives what you demanded in proportion to war score.
- **Dominating pays more than you demanded:** war score can go past 100% of the war goal; the excess becomes points for **extra demands** (more states, puppeting, reparations). **Your own casualties add to those points**, so a long, bloody war you still win dominantly gives the most. The AI gets the same.
- **Relations** run Hostile → Cold → Neutral → Cordial → Friendly.
- **Treaties:** alliance, defensive pact, trade agreement, guarantee of independence, embargo.
- **Infamy** rises when you take land. High infamy makes others hostile and can form coalitions against you.
- AI countries start plays, back sides and join coalitions.

### Power blocs, puppets, companies, charters

- **Power blocs:** a major power founds a bloc and invites others. Bloc types: trade league, empire, military alliance, ideological union. The leader picks **2–3 principles** (buffs). Examples: members trade with no tariffs; members get +15% troop refill; members' universities research faster. The leader gets the most; members get protection and a share of the buffs. *(Full principle list is the builder's call; at least 8 principles.)*
- **Puppets:** won in peace deals or pressured into it. They join your wars and pay you a cut of their income; they can be annexed after a number of years if they don't rebel first.
- **Companies:** historical (East India Company, Hudson's Bay Company, …) and generic. Each boosts a building type (mines, textiles, railways, …) and gives a bonus while you own enough of those buildings.
- **Charters:** extra rights granted to a company — colonise a region, hold a monopoly, build in a puppet's land. Each gives a bigger bonus but costs control or income.

### Research

- **Three trees:** Production (mines, railways, steel, electricity), Military (rifles, artillery, ironclads, trenches, troop refill), Society (banking, universities, medicine, public health, SoL).
- **Eras from 1770 to about 1940**, so the 1776 and 1836 starts begin with different techs known and later start dates have room.
- **Research points** from population, literacy and universities. One tech at a time, from a queue.
- Techs unlock new buildings, building upgrades (more output), better troops and ships, bigger troop pools, and SoL boosts.
- **Tech spread:** a tech most of the world already knows is cheaper; being ahead of your time costs more.

### Laws and politics

- **8 law areas**, each with 3–4 options:
  - Government: absolute monarchy, constitutional monarchy, republic (+ more if wanted)
  - Voting: none, wealth-based, universal
  - Trade: mercantilism, protectionism, free trade
  - Labour: serfdom, slavery, free labour
  - Army: professional, conscription, mass conscription
  - Taxes: low, medium, high
  - Education: none, religious schools, public schools
  - Welfare: none, poor laws, social security
- Every option has clear trade-offs (e.g. free trade: more trade income, weaker home industry; mass conscription: huge troop pool, slower growth).
- **Six interest groups:** landowners, industrialists, workers, clergy, army, intellectuals. Each likes and hates certain laws. Passing a law takes a few months and needs enough group support.
- Groups left angry for long enough **revolt**: rebels appear as a new country on the map with troops, fought like any war. Civil wars and the American Revolution use this system.

### Statistics

GDP, population, SoL, literacy, treasury, income/expenses, troops, infamy, research speed and world rank, with history charts over time.

### AI

- **Five levels:** Easy, Normal, Hard, Very Hard, Grand Master. Set for the whole game, with an option to make the player's rivals one level harder.
- Higher levels improve: build choices, timing attacks (when your troops are low or you're busy elsewhere), protecting trade, using diplomatic plays and blocs, research order, keeping interest groups happy. Easy is slow and rarely attacks the player; Grand Master plays like a sharp human.
- **Easy to Very Hard play fair. Grand Master gets modest, openly stated bonuses** on top of its best play, shown on the difficulty screen. *(Exact bonuses are the builder's call.)*
- Each AI country has a **historical personality** (Britain: trade and navy; Russia: expansion; Prussia: Germany).
- The AI issues the same commands the player can; it never edits game state directly.

### Events

- Shown as a card with 2–3 choices and clear effects; some start chains over years.
- Fire on a date or when conditions are met; apply to AI-controlled countries too, so the AI plays out history.
- Effects can include: change laws, spawn rebels, transfer states, form a new nation (e.g. Germany, Italy), change relations, found blocs, money, temporary modifiers.
- **First set:**
  - 1776: American Revolution; French Revolution and the Napoleonic chain; partitions of Poland.
  - 1836: the Great Game (UK vs Russia); German unification (Prussia vs Austria); Italian unification; opening of Japan; Opium Wars; the Eastern Question (Ottomans); US westward expansion and Civil War.

### Interface

- **Landscape** on iPhone; landscape and portrait-friendly on iPad. Approved mockup: https://claude.ai/artifact/9y7DyBn6xWJx5kGi2iPxmX (layout A for iPhone; layout A with docked panel for iPad).
- **iPhone (layout A):** full-screen map; top bar (country, date, pause + 3 speeds, treasury with daily change, GDP, population, SoL); **bottom tab bar**; tabs open **pull-up sheets** (half height keeps the map visible, full height for big screens) that swipe away; a **vertical attack slider** at the right edge under the right thumb.
- **iPad:** same tabs at the bottom; the panel **docks to the right** instead of covering the map; minimap bottom-left; room for one extra tab. Works in split view and with keyboard/trackpad.
- **Tabs:** the mockup showed Build, Army, Trade, Diplomacy, Bloc, Stats, which predates research and laws. Proposed iPhone tabs (max 6): **Build, Army, Trade, Diplomacy** (includes power bloc and puppets), **Research, Nation** (stats, laws, interest groups, companies). iPad splits Power Bloc into its own seventh tab. *(Designer's call; confirm.)*
- **Everywhere:** tap targets ≥ 44 pt, most-used controls in the bottom corners; pinch zoom, drag pan, tap select, long-press for details, no hover; nothing under the Dynamic Island or home bar in either landscape direction (use safe-area insets); haptic tap where supported when a building finishes or war is declared; installs to the Home Screen and runs full screen and offline; on PC, mouse, scroll-to-zoom and keyboard shortcuts.
- Event notifications appear as a toast at the top; tapping opens the event card.

## Suggested build stages

Each stage ends with something playable.

1. **Core:** world map with states and the 1836 start; GPU map rendering; touch/mouse controls; UI shell (layout A, iPad dock); troop pool, attacks, unclaimed land; buildings, goods, money, GDP, population, SoL; save/load; basic AI on the difficulty framework; end date and score. (Wars here may use a temporary "declare war" until stage 3.)
2. **Trade and navy:** ports, trade routes, visible trade ships, warships, transports, piracy, privateers, escorts.
3. **Diplomacy:** relations, treaties, diplomatic plays, war score, peace deals with extra demands, infamy, coalitions, puppets.
4. **Research, laws, interest groups, revolts.**
5. **Power blocs, companies, charters.**
6. **Events and formable nations; the 1776 start.**
7. **AI depth up to Grand Master; balance and polish.**

## Calls made by the designer (owner to check)

- **AI runs inside the deterministic simulation** (seeded, issuing commands), so AI games replay identically and multiplayer later needs no AI rework.
- **Occupied tiles do not change who controls a state** until the peace deal; control of a state (its population, buildings, income) stays with its owner during war, but occupation counts for war score and stops that state's production for its owner.
- **The map does not wrap east–west** (like OpenFront); equirectangular projection, Antarctica left out.
- **Trade routes are automatic** (the game opens routes for surpluses), with the player able to cancel or prioritise routes in the Trade tab.
- **Saves carry a version number**; an update that can't load an older save says so instead of failing silently.
- **Tabs:** as proposed in Interface (Companies under Nation; iPad's seventh tab is Power Bloc).

## Left to the builder

- Tick rate, map resolution within the stated range, and all numeric tuning (prices, costs, growth, combat formulas, score weights, Grand Master bonuses).
- Library choices within the constraints (e.g. a WebGL renderer such as PixiJS, a bundler such as Vite, a test runner such as Vitest).
- Full lists of techs, principles, companies and charters, within the shapes above.
- Exact historical borders, simplified where fiddly.
- Art style of map icons and UI, following the approved mockup's direction.
