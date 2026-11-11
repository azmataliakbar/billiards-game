/* 8-ball rules: pure logic, no DOM. Works in the browser (window.BilliardRules) and in Node.

   - The table is open until a player pockets a solid or a stripe on a legal shot. That player owns that group.
     The other group goes to the other player.
   - Your first contact must be a ball of your group. When all your group is pocketed, it must be the 8 ball.
     On an open table, any ball except the 8 may be hit first.
   - Foul: no ball hit, the cue ball pocketed, or a wrong first contact. The turn passes, and the opponent places the
     cue ball anywhere behind the head string (ball in hand). A foul gives no credit for balls pocketed on that shot.
   - A legal shot that pockets one of your own balls keeps your turn. Otherwise the turn passes.
   - The 8 ball: pocket it legally after clearing your group and you win. Pocketing it early, on a foul,
     or on an open table loses the game. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.BilliardRules = api;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // players: [{ name, computer, difficulty }]. Each player gets a group (solid, stripe) when the table is decided.
  function createGame(players) {
    if (!Array.isArray(players) || players.length < 1 || players.length > 2) {
      throw new Error("A game needs 1 or 2 players");
    }
    return {
      players: players.map(function (p, i) {
        return {
          name: String(p.name || "Player " + (i + 1)).slice(0, 20),
          computer: !!p.computer,
          difficulty: p.difficulty || "medium",
          group: null,        // "solid" | "stripe" | null while the table is open
          pocketed: 0,        // own balls pocketed
          fouls: 0
        };
      }),
      turn: 0,
      shots: 0,
      over: false,
      winner: -1,
      ballInHand: true        // the breaker places the cue ball behind the head string
    };
  }

  function nextPlayer(state) {
    return (state.turn + 1) % state.players.length;
  }

  // What player p must hit now: "open", "solid", "stripe" or "eight".
  // objectBalls: the object balls on the table (alive) before the shot.
  function targetFor(p, objectBalls) {
    if (!p.group) return "open";
    var left = objectBalls.some(function (b) { return b.group === p.group; });
    return left ? p.group : "eight";
  }

  // "Player 1's" or "Your" (for the solo player, whose name is "You").
  function possessive(name) {
    return name === "You" ? "Your" : name + "'s";
  }

  function label(t) {
    if (t === "solid") return "SOLIDS (1–7)";
    if (t === "stripe") return "STRIPES (9–15)";
    if (t === "eight") return "the 8 ball";
    return "any ball except the 8";
  }

  // Resolves one finished shot.
  // info: { pocketed: object balls pocketed in this shot, cueScratch: true if the cue ball fell in,
  //         firstTouch: the first object ball the cue ball touched (or null), before: object balls alive before the shot }
  // Returns { foul, reason, continues, ballInHand, message }.
  function resolveShot(state, info) {
    if (state.over) throw new Error("The game is over");
    var shooter = state.turn;
    var p = state.players[shooter];
    var opp = nextPlayer(state);
    var q = state.players[opp];
    var pocketed = info.pocketed || [];
    var before = info.before || [];
    var first = info.firstTouch || null;
    var scratch = !!info.cueScratch;
    var target = targetFor(p, before);

    state.shots += 1;

    var reason = "";
    if (scratch) {
      reason = "the cue ball was pocketed";
    } else if (!first) {
      reason = "the cue ball touched no ball";
    } else if (target === "open" && first.group === "eight") {
      reason = "you must not hit the 8 ball first";
    } else if (target === "eight" && first.group !== "eight") {
      reason = "you must hit the 8 ball first";
    } else if ((target === "solid" || target === "stripe") && first.group !== target) {
      reason = "you must hit " + label(target) + " first";
    }
    var foul = reason !== "";

    // The 8 ball ends the game.
    if (pocketed.some(function (b) { return b.group === "eight"; })) {
      var won = !foul && target === "eight";
      state.over = true;
      state.winner = won ? shooter : opp;
      var msg = won
        ? p.name + " pocketed the 8 ball and wins!"
        : p.name + " pocketed the 8 ball " + (foul ? "on a foul" : "too early") + ". " + q.name + " wins!";
      return { foul: foul, reason: reason, continues: false, ballInHand: false, message: msg };
    }

    if (foul) {
      p.fouls += 1;
      state.turn = opp;
      state.ballInHand = true;
      return {
        foul: true,
        reason: reason,
        continues: false,
        ballInHand: true,
        message: p.name + " fouled: " + reason + ". " + q.name + " places the cue ball."
      };
    }

    // A legal shot. On an open table, the first group ball pocketed decides the groups.
    var assigned = null;
    if (!p.group) {
      var gb = pocketed.filter(function (b) { return b.group === "solid" || b.group === "stripe"; })[0];
      if (gb) {
        assigned = gb.group;
        p.group = gb.group;
        q.group = gb.group === "solid" ? "stripe" : "solid";
      }
    }

    var own = p.group ? pocketed.filter(function (b) { return b.group === p.group; }).length : 0;
    p.pocketed += own;
    var continues = own > 0;
    if (!continues) state.turn = opp;
    state.ballInHand = false;

    var parts = [];
    if (assigned) parts.push(p.name + " takes " + label(assigned) + ".");
    if (own > 0) parts.push(p.name + " pocketed " + own + " ball" + (own > 1 ? "s" : "") + " and shoots again.");
    else parts.push("No ball of your group pocketed. " + possessive(q.name) + " turn.");
    return { foul: false, reason: "", continues: continues, ballInHand: false, message: parts.join(" ") };
  }

  return {
    createGame: createGame,
    nextPlayer: nextPlayer,
    targetFor: targetFor,
    label: label,
    possessive: possessive,
    resolveShot: resolveShot
  };
});
