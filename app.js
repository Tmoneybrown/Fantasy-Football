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

  function tag(text, status) {
    if (!text) return "";
    var kind = tone(status || text);
    return '<span class="tag' + (kind ? " " + kind : "") + '">' + esc(text) + "</span>";
  }

  function catLabel(name) {
    if (name.indexOf("Top") === 0) return "Top Stashes";
    if (name.indexOf("Deeper") === 0) return "Deeper Options";
    if (name.indexOf("IDP") === 0) return "IDP";
    if (name.indexOf("Off IR") === 0) return "Off IR Now";
    return name;
  }

  function irSummary(league) {
    return league.categories.map(function (cat) {
      return cat.players.length + " " + catLabel(cat.category);
    }).join(" · ");
  }

  function irStatus(league) {
    var players = league.categories.reduce(function (all, cat) {
      return all.concat(cat.players);
    }, []);
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

  function lockDetails(league) {
    var starters = (league.starters || []).map(function (starter) {
      var pos = starter.pos ? '<span class="meta">' + esc(starter.pos) + "</span>" : "";
      return '<article class="detail sev-' + (tone(starter.status) || "green") + '">' +
        '<div class="who">' + dot(starter.status) + "<b>" + esc(starter.player) + "</b>" + pos + "</div>" +
        (starter.note ? '<p class="meta">' + esc(starter.note) + "</p>" : "") +
        "</article>";
    }).join("");
    var pickups = league.starters ? league.starters.reduce(function (all, starter) {
      return all.concat(starter.pickups || []);
    }, []) : [];
    if (league.pickups) pickups = pickups.concat(league.pickups);
    var pickupHtml = pickups.length
      ? '<ul class="plist">' + pickups.map(function (pickup) {
          if (typeof pickup === "string") return "<li>" + esc(pickup) + "</li>";
          return "<li><b>" + esc(pickup.player || pickup.name || "Pickup") + "</b>" +
            '<span class="meta">' + esc([pickup.pos, pickup.team, pickup.note].filter(Boolean).join(" · ")) + "</span></li>";
        }).join("") + "</ul>"
      : '<p class="meta">No emergency pickups.</p>';
    return starters + "<h4>Pickups</h4>" + pickupHtml;
  }

  function irDetails(league) {
    return league.categories.map(function (cat) {
      var rows = cat.players.map(function (player) {
        var status = player.status || player.ret_1019 || "";
        var bits = [
          player.pos,
          player.team,
          player.injury,
          player.ret_wk != null ? "return W" + player.ret_wk : ""
        ].filter(Boolean);
        return '<li><b>' + esc(player.player) + "</b>" +
          tag(status, status) +
          '<span class="meta">' + esc(bits.join(" · ")) + "</span>" +
          (player.note ? '<span class="meta">' + esc(player.note) + "</span>" : "") +
          "</li>";
      }).join("");
      return "<h4>" + esc(catLabel(cat.category)) + '</h4><ul class="plist">' + rows + "</ul>";
    }).join("");
  }

  function faRow(player, pos, forceDrop) {
    var bits = ["#" + player.rank];
    if (pos) bits.push(pos);
    if (player.team) bits.push(player.team);
    if (player.pts != null) bits.push(player.pts + " pts");
    var statusText = player.tag || (player.status === "drop" || forceDrop ? "DROP" : player.status === "fa" ? "FA" : player.status || "");
    var tags = tag(statusText, player.status || (forceDrop ? "drop" : ""));
    if (player.injury) tags += " " + tag(player.injury, player.injury);
    return "<li><b>" + esc(player.player) + "</b>" +
      '<span class="meta">' + esc(bits.join(" · ")) + "</span>" +
      tags +
      (player.note ? '<span class="meta">' + esc(player.note) + "</span>" : "") +
      "</li>";
  }

  function faDetails(league) {
    var groups = Object.keys(league.top_by_pos || {}).map(function (pos) {
      var rows = (league.top_by_pos[pos] || []).map(function (player) {
        return faRow(player, pos);
      }).join("");
      return "<h4>" + esc(pos) + '</h4><ul class="plist">' + rows + "</ul>";
    }).join("");
    var drops = (league.new_drops || []).map(function (player) {
      return faRow(player, player.pos, true);
    }).join("");
    return groups + "<h4>New Drops</h4><ul class=\"plist\">" + (drops || '<li class="meta">None</li>') + "</ul>";
  }

  function details(kind, league) {
    if (kind === "bye") return byeDetails(league);
    if (kind === "lock") return lockDetails(league);
    if (kind === "ir") return irDetails(league);
    return faDetails(league);
  }

  function subtitle(kind, data) {
    if (kind === "bye") return "Weeks " + String(data.weeks || "").replace("-", "–");
    if (kind === "lock") return "Week " + data.week + (data.lock ? " · " + data.lock : "");
    if (kind === "ir" && data.weeks) {
      return Object.keys(data.weeks).map(function (key) {
        return key + " " + data.weeks[key];
      }).join(" · ");
    }
    if (kind === "fa") return "Through week " + data.through_week;
    return "";
  }

  function render(section, data) {
    var kind = section.getAttribute("data-kind");
    section.querySelector(".updated").textContent = "Updated " + fmtDate(data.updated);
    section.querySelector(".sub").textContent = subtitle(kind, data);
    var mount = section.querySelector(".mount");
    mount.innerHTML = data.leagues.map(function (league, index) {
      var meta = leagueMeta(kind, league);
      var panelId = section.id + "-panel-" + index;
      return '<div class="league-item">' +
        '<button type="button" class="league-btn" aria-expanded="false" aria-controls="' + panelId + '">' +
          dot(meta.status) +
          '<span class="league-id"><b class="league">' + esc(league.league) + "</b>" +
            '<span class="meta">' + esc(league.team) + " · " + esc(league.platform) + "</span></span>" +
          '<span class="summary">' + esc(meta.summary) + "</span>" +
          '<span class="chev" aria-hidden="true">▸</span>' +
        "</button>" +
        '<div class="panel" id="' + panelId + '" hidden>' + details(kind, league) + "</div>" +
        "</div>";
    }).join("");
  }

  function fail(section) {
    section.querySelector(".updated").textContent = "Could not load this report.";
  }

  document.querySelectorAll(".report").forEach(function (section) {
    fetch(section.getAttribute("data-file"))
      .then(function (res) {
        if (!res.ok) throw new Error(String(res.status));
        return res.json();
      })
      .then(function (data) { render(section, data); })
      .catch(function () { fail(section); });
  });

  document.addEventListener("click", function (event) {
    var button = event.target.closest(".league-btn");
    if (!button) return;
    var panel = document.getElementById(button.getAttribute("aria-controls"));
    var open = button.getAttribute("aria-expanded") === "true";
    button.setAttribute("aria-expanded", open ? "false" : "true");
    if (panel) panel.hidden = open;
  });
})();
