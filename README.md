# Billiards (8-ball)

A top-view 8-ball table with a cue ball, 15 object balls and six pockets. Play against the computer (three levels) or with a second player on the same device. Loud, generated sound. Plain HTML, CSS and JavaScript. No dependencies, no build step, no API keys.

## Run it

Double-click `index.html`.

## Modes

- **1 Player:** you against the computer. You break first.
- **2 Players:** two people on one device, taking turns.

## Rules (easy)

1. The rack has solids 1–7, stripes 9–15 and the black 8 ball.
2. The table is open until someone pockets a solid or a stripe on a legal shot. That player owns that group; the other group goes to the other player.
3. Your first contact must be a ball of your group. When all of your group is pocketed, the first contact must be the 8 ball. On an open table, any ball except the 8 may be hit first.
4. The turn line says which ball to hit now, for example **Now hit: SOLIDS (1–7)**.
5. A legal shot that pockets one of your own balls keeps your turn. Otherwise the turn passes.
6. **Foul:** no ball hit, the cue ball pocketed, or the wrong first contact. The turn passes and the opponent places the cue ball behind the line (ball in hand). Balls pocketed on a foul get no credit.
7. **Win:** pocket the 8 ball after clearing your group, with a legal first contact. Pocketing the 8 early, on a foul, or on an open table loses the game.

## How to shoot

- Press on the cue ball, pull back, and let go. The further you pull, the harder the shot (full power at 150 units).
- The dashed black line shows the path. It runs to the first ball the cue ball will hit, or to the cushion.
- The guide under the table says **First hit: SOLIDS ✓** (green) when that ball is legal, and **✗** (red) when it is not.
- With ball in hand, drag inside the left quarter (behind the line) to place the cue ball, then aim.

## The computer

- Looks for a **pot**: a target ball and a pocket with a clear path for both the ball and the cue ball. It picks the shortest one.
- On a full rack it **breaks** hard at the nearest ball (never the 8).
- With no clean pot it plays a **safety**: a gentle roll into the nearest legal ball.
- **Easy, Medium, Expert** differ in aim error and power error. Easy misses more often.

## Sound

Every sound is generated in the browser with the Web Audio API: cue strike, ball clicks, cushion knock, pocket drop, foul buzz, win arpeggio. Use the Sound button and the Volume slider. The setting is saved in the browser under `bil_vault_v1_sound`.

## Tests

```bash
node --test tests/billiards.test.js
```

The 25 tests cover the rack, physics (collisions, pockets, cushions, friction, the cue contact), rules (groups, fouls, scratch, the 8 ball, targets), and the computer (pot, safety, break, Easy versus Expert).

Full computer-vs-computer games were also simulated during development. At every level the games finish, no ball leaves the table, and no shot gets stuck.

## Structure

```
index.html              menu (modes, level, how to play), match screen, scoreboard, power, guide, footer
css/app.css             wooden frame, glass panels, responsive table, guide colours, footer
js/config.js            table size, physics, levels, pocket positions
js/physics.js           balls, rack, collisions, cushions, pockets, friction, events (pure)
js/rules.js             groups, fouls, ball in hand, the 8 ball, turns (pure)
js/ai.js                computer: pots, breaks, safeties, level errors (pure)
js/sound.js             generated sound with volume and mute
js/render.js            table, pockets, balls, cue stick, aim and first-hit guide
js/app.js               menus, input (mouse and touch), match loop, HUD
tests/billiards.test.js tests for physics, rules and the computer
```

## Notes

- Physics runs in fixed steps, so a shot plays the same on every device.
- The table is drawn on a canvas and sized by CSS, so it stays in proportion on phones and laptops (from 270px).
- Spin (English) is not included yet.
