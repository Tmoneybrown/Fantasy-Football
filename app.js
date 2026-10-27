(function () {
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }

  function fmtDate(iso) {
    var parts = String(iso || "").split("-");
    if (parts.length !== 3) return esc(iso);
    var month = MONTHS[Number(parts[1]) - 1] || parts[1];
    return month + " " + Number(parts[2]) + ", " + parts[0];
  }

  function tone(status) {
    var s = String(status || "").toLowerCase();
    if (s === "red" || s === "out") return "red";
    if (s === "orange" || s === "questionable" || s === "q") return "orange";
    if (s === "green" || s === "clear" || s === "fa" || s === "active") return "green";
    if (s === "drop") return "red";
    return "";
  }

  function dot(status) {
    var kind = tone(status);
    return '<span class="dot' + (kind ? " " + kind : "") + '" aria-hidden="true"></span>';
  }

  function posPill(pos) {
    if (!pos) return "";
    var key = String(pos).toUpperCase();
    var kind = "idp";
    if (key === "TE") kind = "te";
    else if (key === "WR") kind = "wr";
    else if (key === "RB") kind = "rb";
    else if (key === "QB") kind = "qb";
    return '<span class="pos pos-' + kind + '">' + esc(key) + "</span>";
  }

  function catLabel(name) {
    if (name.indexOf("Top") === 0) return "Top Stashes";
    if (name.indexOf("Deeper") === 0) return "Deeper Options";
    if (name.indexOf("IDP") === 0) return "IDP";
    if (name.indexOf("Off IR") === 0) return "Off IR Now";
    return name;
  }

  function irTokens(league) {
    var tokens = [];
    function add(value) {
      var text = String(value || "").trim().toLowerCase();
      if (text && tokens.indexOf(text) === -1) tokens.push(text);
    }
    add(league.league);
    add(league.platform);
    var aliases = {
      "TRTOFF": ["mfl"],
      "Lonestar Dynasty": ["lonestar"],
      "Brews and Q's": ["brews"],
      "Tomball Never Dies": ["tomball"]
    };
    (aliases[league.league] || []).forEach(add);
    var first = String(league.league || "").split(/\s+/)[0];
    if (first.length >= 3) add(first);
    return tokens;
  }

  function irRosteredHere(note, league) {
    var text = String(note || "");
    var at = text.toLowerCase().indexOf("rostered");
    if (at === -1) return false;
    var after = text.slice(at);
    return irTokens(league).some(function (token) {
      var escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp("\\b" + escaped + "\\b", "i").test(after);
    });
  }

  function irPlayers(league) {
    var list = [];
    var index = 0;
    (league.categories || []).forEach(function (cat) {
      var label = catLabel(cat.category);
      (cat.players || []).forEach(function (player) {
        var copy = {};
        Object.keys(player).forEach(function (key) { copy[key] = player[key]; });
        copy._cat = label;
        copy._i = index++;
        if (!irRosteredHere(copy.note, league)) list.push(copy);
      });
    });
    return list;
  }

  function irSummary(league) {
    var counts = {};
    var order = [];
    irPlayers(league).forEach(function (player) {
      if (!counts[player._cat]) {
        counts[player._cat] = 0;
        order.push(player._cat);
      }
      counts[player._cat] += 1;
    });
    return order.map(function (label) { return counts[label] + " " + label; }).join(" · ");
  }

  function irStatus(league) {
    var players = irPlayers(league);
    if (players.some(function (player) { return /out/i.test(player.status || "") || /out/i.test(player.injury || ""); })) return "red";
    if (players.some(function (player) { return /questionable/i.test(player.injury || "") || /questionable/i.test(player.status || ""); })) return "orange";
    return "green";
  }

  function faPlayers(league) {
    var lists = [];
    Object.keys(league.top_by_pos || {}).forEach(function (pos) {
      lists = lists.concat(league.top_by_pos[pos] || []);
    });
    return lists;
  }

  function faSummary(league) {
    var drops = (league.new_drops || []).length;
    var questionable = faPlayers(league).filter(function (player) {
      return /questionable/i.test(player.injury || "");
    }).length;
    var line = league.scoring + " · " + drops + " new drop" + (drops === 1 ? "" : "s");
    if (questionable) line += " · " + questionable + " questionable";
    return line;
  }

  function faStatus(league) {
    var players = faPlayers(league);
    if (players.some(function (player) { return /out/i.test(player.injury || "") || /out/i.test(player.status || ""); })) return "red";
    if (players.some(function (player) { return /questionable/i.test(player.injury || ""); })) return "orange";
    return "green";
  }

  function leagueMeta(kind, league) {
    if (kind === "ir") return { status: irStatus(league), summary: irSummary(league) };
    if (kind === "fa") return { status: faStatus(league), summary: faSummary(league) };
    return { status: league.status, summary: league.summary };
  }

  function byeDetails(league) {
    return league.items.map(function (item) {
      var sev = tone(item.severity) || "green";
      var slot = item.slot ? '<span class="meta">' + esc(item.slot) + "</span>" : "";
      return '<article class="detail sev-' + sev + '">' +
        '<div class="rw"><b class="wk">Week ' + esc(item.week) + "</b>" + slot + "</div>" +
        "<p>" + esc(item.issue) + "</p>" +
        '<p class="meta">' + esc(item.suggestion) + "</p>" +
        "</article>";
    }).join("");
  }

  var IR_POS_ORDER = ["QB", "RB", "WR", "TE", "K", "D/ST", "DST", "DEF", "DL", "LB", "DB", "DE", "DT", "NT", "CB", "S"];
  var IR_CAT_ORDER = ["Top Stashes", "Deeper Options", "IDP", "Off IR Now"];
  var irGroupSeq = 0;

  function irRankNum(player) {
    if (player.rank == null || player.rank === "") return null;
    var n = Number(player.rank);
    return isFinite(n) ? n : null;
  }

  function irSort(players) {
    return players.slice().sort(function (a, b) {
      var ar = irRankNum(a);
      var br = irRankNum(b);
      if (ar != null && br != null && ar !== br) return ar - br;
      if ((ar != null) !== (br != null)) return ar != null ? -1 : 1;
      var ac = IR_CAT_ORDER.indexOf(a._cat);
      var bc = IR_CAT_ORDER.indexOf(b._cat);
      if (ac === -1) ac = IR_CAT_ORDER.length;
      if (bc === -1) bc = IR_CAT_ORDER.length;
      if (ac !== bc) return ac - bc;
      return a._i - b._i;
    });
  }

  function irCatTag(label) {
    if (label === "Top Stashes") return "Top";
    if (label === "Deeper Options") return "Deeper";
    if (label === "IDP") return "IDP";
    if (label === "Off IR Now") return "Off IR";
    return label;
  }

  function irFlag(player) {
    var ret = player.ret_wk;
    var status = String(player.status || "");
    if (String(ret).toLowerCase() === "active" || status.toLowerCase() === "active") {
      return { text: "Active", kind: "active" };
    }
    var week = "";
    if (typeof ret === "number" && isFinite(ret)) week = String(ret);
    else if (typeof ret === "string" && /^\d+$/.test(ret)) week = ret;
    var extra = "";
    if (/pup/i.test(status)) extra = " (PUP)";
    else if (/nfi/i.test(status)) extra = " (NFI)";
    if (week) return { text: "W" + week + extra, kind: "week" };
    if (status) return { text: status, kind: "week" };
    return { text: "", kind: "" };
  }

  function irRow(player) {
    var flag = irFlag(player);
    var aside = player.note || player.injury || "";
    return '<li class="ir-row">' +
      posPill(player.pos) +
      '<span class="ir-name">' + esc(player.player) + "</span>" +
      '<span class="ir-team">' + esc(player.team || "") + "</span>" +
      '<span class="ir-flag' + (flag.kind ? " ir-flag-" + flag.kind : "") + '">' + esc(flag.text) + "</span>" +
      '<span class="ir-cat">' + esc(irCatTag(player._cat)) + "</span>" +
      '<span class="ir-note">' + esc(aside) + "</span>" +
      "</li>";
  }

  function irGroup(labelHtml, count, rowsHtml) {
    var id = "ir-group-" + (irGroupSeq++);
    var noun = count === 1 ? "player" : "players";
    return '<div class="pos-group">' +
      '<button type="button" class="pos-btn" aria-expanded="false" aria-controls="' + id + '">' +
        labelHtml +
        '<span class="pos-count">' + count + " " + noun + "</span>" +
        '<span class="chev" aria-hidden="true">▸</span>' +
      "</button>" +
      '<div class="pos-panel" id="' + id + '" hidden><ul class="ir-list">' +
        rowsHtml +
      "</ul></div></div>";
  }

  function irDetails(league) {
    var groups = {};
    irPlayers(league).forEach(function (player) {
      var key = String(player.pos || "").toUpperCase();
      if (!key) return;
      if (!groups[key]) groups[key] = [];
      groups[key].push(player);
    });
    return Object.keys(groups).sort(function (a, b) {
      var ia = IR_POS_ORDER.indexOf(a);
      var ib = IR_POS_ORDER.indexOf(b);
      if (ia === -1) ia = IR_POS_ORDER.length;
      if (ib === -1) ib = IR_POS_ORDER.length;
      if (ia !== ib) return ia - ib;
      return a.localeCompare(b);
    }).map(function (pos) {
      var players = irSort(groups[pos]);
      return irGroup(posPill(pos), players.length, players.map(irRow).join(""));
    }).join("");
  }

  var FA_POS_ORDER = ["QB", "RB", "WR", "TE", "K", "D/ST", "DST", "DEF", "DL", "LB", "DB"];

  function faPosKey(pos) {
    return String(pos || "").toUpperCase();
  }

  function faPosIndex(pos) {
    var i = FA_POS_ORDER.indexOf(faPosKey(pos));
    return i === -1 ? FA_POS_ORDER.length : i;
  }

  function faPosKind(pos) {
    var key = faPosKey(pos);
    if (key === "TE") return "te";
    if (key === "WR") return "wr";
    if (key === "RB") return "rb";
    if (key === "QB") return "qb";
    if (key === "K") return "k";
    if (key === "D/ST" || key === "DST" || key === "DEF") return "dst";
    return "idp";
  }

  function faPosLabel(pos) {
    var key = faPosKey(pos);
    if (key === "DST" || key === "DEF" || key === "D/ST") return "D/ST";
    return key;
  }

  function faPosPill(pos) {
    if (!pos) return "";
    return '<span class="fa-pos fa-pos-' + faPosKind(pos) + '">' + esc(faPosLabel(pos)) + "</span>";
  }

  function faPts(pts) {
    if (pts == null || pts === "") return "";
    var n = Number(pts);
    if (!isFinite(n)) return esc(pts);
    if (Math.abs(n - Math.round(n)) < 1e-9) return String(Math.round(n));
    return String(Math.round(n * 10) / 10);
  }

  function faRankNum(player) {
    if (player.rank == null || player.rank === "") return null;
    var n = Number(player.rank);
    return isFinite(n) ? n : null;
  }

  function faSort(players, byPos) {
    return players.slice().sort(function (a, b) {
      if (byPos) {
        var posDelta = faPosIndex(a.pos) - faPosIndex(b.pos);
        if (posDelta) return posDelta;
      }
      var ar = faRankNum(a);
      var br = faRankNum(b);
      if (ar != null && br != null && ar !== br) return ar - br;
      if ((ar != null) !== (br != null)) return ar != null ? -1 : 1;
      var ap = a.pts == null || a.pts === "" ? -Infinity : Number(a.pts);
      var bp = b.pts == null || b.pts === "" ? -Infinity : Number(b.pts);
      if (ap !== bp) return bp - ap;
      return String(a.player || "").localeCompare(String(b.player || ""));
    });
  }

  function faBadges(player, forceDrop) {
    var html = "";
    var dropped = forceDrop || player.status === "drop";
    if (!dropped && player.status === "fa") html += '<span class="fa-pill fa-pill-fa">FA</span>';
    if (dropped) html += '<span class="fa-just">Just dropped</span>';
    if (String(player.tag || "").toUpperCase() === "DROP") html += '<span class="fa-pill fa-pill-drop">DROP</span>';
    if (player.injury) html += '<span class="fa-inj">' + esc(player.injury) + "</span>";
    return html;
  }

  function faRow(player, pos, forceDrop) {
    var position = pos || player.pos || "";
    var rank = faRankNum(player);
    return '<li class="fa-row">' +
      faPosPill(position) +
      '<span class="fa-who"><span class="fa-name">' + esc(player.player) + "</span>" +
      '<span class="fa-team">' + esc(player.team || "") + "</span></span>" +
      '<span class="fa-rank">' + (rank == null ? "" : esc(faPosLabel(position) + rank)) + "</span>" +
      '<span class="fa-pts">' + faPts(player.pts) + "</span>" +
      '<span class="fa-badges">' + faBadges(player, forceDrop) + "</span>" +
      "</li>";
  }

  var faGroupSeq = 0;

  function faGroup(labelHtml, count, rowsHtml) {
    var id = "fa-group-" + (faGroupSeq++);
    var noun = count === 1 ? "player" : "players";
    return '<div class="pos-group">' +
      '<button type="button" class="pos-btn" aria-expanded="false" aria-controls="' + id + '">' +
        labelHtml +
        '<span class="pos-count">' + count + " " + noun + "</span>" +
        '<span class="chev" aria-hidden="true">▸</span>' +
      "</button>" +
      '<div class="pos-panel" id="' + id + '" hidden><div class="fa-scroll"><ul class="fa-list">' +
        (rowsHtml || '<li class="fa-empty">None</li>') +
      "</ul></div></div></div>";
  }

  function faDetails(league) {
    var map = league.top_by_pos || {};
    var groups = Object.keys(map).sort(function (a, b) {
      var delta = faPosIndex(a) - faPosIndex(b);
      return delta || a.localeCompare(b);
    }).map(function (pos) {
      var players = faSort(map[pos] || []);
      var rows = players.map(function (player) { return faRow(player, pos); }).join("");
      return faGroup(faPosPill(pos), players.length, rows);
    }).join("");
    var drops = faSort(league.new_drops || [], true);
    var dropRows = drops.map(function (player) { return faRow(player, player.pos, true); }).join("");
    return groups + faGroup('<b class="pos-title">New Drops</b>', drops.length, dropRows);
  }

  function details(kind, league) {
    if (kind === "bye") return byeDetails(league);
    if (kind === "ir") return irDetails(league);
    return faDetails(league);
  }

  function subtitle(kind, data) {
    if (kind === "bye") return "Weeks " + String(data.weeks || "").replace("-", "–");
    if (kind === "ir" && data.weeks) {
      return Object.keys(data.weeks).map(function (key) {
        return key + " " + data.weeks[key];
      }).join(" · ");
    }
    if (kind === "fa") return "Through week " + data.through_week;
    return "";
  }

  var RANK = { green: 0, orange: 1, red: 2 };
  var REPORTS = [
    { kind: "bye", title: "Bye Week Planner", file: "data/bye_planner.json" },
    { kind: "ir", title: "IR Stash Alerts", file: "data/ir_stash.json" },
    { kind: "fa", title: "Free Agent Radar", file: "data/free_agents.json" }
  ];

  function byLeague(data) {
    var map = {};
    (data.leagues || []).forEach(function (league) { map[league.league] = league; });
    return map;
  }

  function worstStatus(statuses) {
    var best = "green";
    var rank = -1;
    statuses.forEach(function (status) {
      var kind = tone(status) || "green";
      var value = RANK[kind] == null ? 0 : RANK[kind];
      if (value > rank) {
        rank = value;
        best = kind;
      }
    });
    return best;
  }

  function shortIr(league) {
    if (!league) return "";
    var count = irPlayers(league).filter(function (player) {
      return player._cat === "Top Stashes";
    }).length;
    return count + " top stash" + (count === 1 ? "" : "es");
  }

  function shortFa(league) {
    if (!league) return "";
    var drops = (league.new_drops || []).length;
    var questionable = faPlayers(league).filter(function (player) {
      return /questionable/i.test(player.injury || "");
    }).length;
    var line = drops + " new drop" + (drops === 1 ? "" : "s");
    if (questionable) line += ", " + questionable + " questionable";
    return line;
  }

  function combinedSummary(parts) {
    return [
      parts.bye && parts.bye.summary,
      shortIr(parts.ir),
      shortFa(parts.fa)
    ].filter(Boolean).join(" · ");
  }

  function subreport(report, league) {
    var body = league ? details(report.kind, league) : '<p class="meta">No data in this report.</p>';
    var context = report.data ? subtitle(report.kind, report.data) : "";
    return '<section class="subreport">' +
      '<div class="report-head"><h3>' + esc(report.title) + "</h3>" +
        '<p class="m">Updated ' + fmtDate(report.data && report.data.updated) + "</p></div>" +
      (context ? '<p class="m sub">' + esc(context) + "</p>" : "") +
      body +
      "</section>";
  }

  var TEAM_ORDER = ["TRUMP", "PCD", "TRTOFF", "Lonestar Dynasty", "Brews and Q's", "Tomball Never Dies"];

  function renderTeams(reports) {
    var maps = {};
    var seen = {};
    reports.forEach(function (report) {
      maps[report.kind] = byLeague(report.data);
      (report.data.leagues || []).forEach(function (league) { seen[league.league] = true; });
    });
    var order = TEAM_ORDER.filter(function (name) { return seen[name]; });
    Object.keys(seen).forEach(function (name) {
      if (order.indexOf(name) === -1) order.push(name);
    });
    var mount = document.getElementById("teams");
    mount.innerHTML = order.map(function (name, index) {
      var parts = {
        bye: maps.bye[name],
        ir: maps.ir[name],
        fa: maps.fa[name]
      };
      var sample = parts.bye || parts.ir || parts.fa;
      var status = worstStatus([
        parts.bye && parts.bye.status,
        parts.ir && irStatus(parts.ir),
        parts.fa && faStatus(parts.fa)
      ].filter(function (item) { return item != null && item !== false; }));
      var panelId = "team-panel-" + index;
      return '<div class="league-item">' +
        '<button type="button" class="league-btn" aria-expanded="false" aria-controls="' + panelId + '">' +
          dot(status) +
          '<span class="league-id"><span class="who"><b class="team">' + esc(sample.team) + "</b>" +
            '<b class="league">' + esc(name) + "</b></span>" +
            '<span class="meta">' + esc(sample.platform) + "</span></span>" +
          '<span class="summary">' + esc(combinedSummary(parts)) + "</span>" +
          '<span class="chev" aria-hidden="true">▸</span>' +
        "</button>" +
        '<div class="panel" id="' + panelId + '" hidden>' +
          reports.map(function (report) { return subreport(report, maps[report.kind][name]); }).join("") +
        "</div>" +
        "</div>";
    }).join("");
  }

  var root = document.getElementById("teams");
  Promise.all(REPORTS.map(function (report) {
    return fetch(report.file).then(function (res) {
      if (!res.ok) throw new Error(String(res.status));
      return res.json();
    }).then(function (data) {
      report.data = data;
      return report;
    });
  })).then(renderTeams).catch(function () {
    root.innerHTML = '<p class="m">Could not load the reports.</p>';
  });

  document.addEventListener("click", function (event) {
    var button = event.target.closest(".pos-btn") || event.target.closest(".league-btn");
    if (!button) return;
    var panel = document.getElementById(button.getAttribute("aria-controls"));
    var open = button.getAttribute("aria-expanded") === "true";
    button.setAttribute("aria-expanded", open ? "false" : "true");
    if (panel) panel.hidden = open;
  });
})();
