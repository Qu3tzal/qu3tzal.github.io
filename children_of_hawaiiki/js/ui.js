"use strict";

const $panel = () => document.getElementById("panel");
const $topinfo = () => document.getElementById("topinfo");
const $overlay = () => document.getElementById("overlay");

const JOB_LABELS = {
  fisher: "Fishers", farmer: "Farmers", woodcutter: "Woodcutters",
  builder: "Builders", scout: "Scouts", navigator: "Navigators",
};

function fmt(n, dec) { return Number(n).toFixed(dec == null ? 0 : dec); }

function renderAll() {
  renderTop();
  if (G.phase === "voyage") renderVoyagePanel();
  else renderIslandPanel();
  renderOverlay();
}

function renderTop() {
  if (G.phase === "voyage") {
    const v = G.voyage;
    $topinfo().innerHTML =
      `At sea, day <b>${v.day}</b> · bound for <b>${v.dest.tier > 0 || v.dest.final ? v.dest.name : "unknown land"}</b> · voyage ${G.legIndex + 1} of ${LEGS.length}`;
  } else {
    $topinfo().innerHTML =
      `<b>${G.island.name}</b> · Moon <b>${G.turn}</b> · island ${G.legIndex + 1} of ${LEGS.length + 1} on the road to Hawaiʻi`;
  }
}

function logHTML() {
  const items = G.log.slice(-60).reverse().map(e =>
    `<div class="${e.cls}"><span class="turnno">${e.turn}</span>${e.text}</div>`).join("");
  return `<h3>Chronicle</h3><div id="log">${items}</div>`;
}

function renderIslandPanel() {
  const y = yields();
  const isl = G.island;
  const eat = G.pop;
  const foodNet = y.fish + y.farm - eat;
  const canoeFrac = G.canoe.progress / G.canoe.required;

  let candHTML = "";
  G.candidates.forEach((c, i) => {
    let info;
    if (c.final) {
      info = `The legendary paradise. ${Math.round(c.dist)} days' sail ${c.dirHint}.`;
    } else if (c.tier === 0) {
      info = `Rumors of land ${c.dirHint}. Send scouts to learn more.`;
    } else {
      const parts = [`~${Math.round(c.tier >= 3 ? c.dist : c.estDist)} days' sail`];
      if (c.tier >= 2) parts.push(`${qualityWord(c.fish)} fishing, ${qualityWord(c.fertility)} soil, ${c.forestMax >= 70 ? "tall forest" : "little timber"}`);
      if (c.tier >= 3) parts.push("star-path memorized");
      info = parts.join(" · ");
    }
    const nm = c.tier > 0 || c.final ? c.name : "Unknown land";
    const tierLabel = c.final ? "destiny" : `lore ${c.tier}/3`;
    const sel = i === G.scoutTarget ? " sel" : "";
    candHTML += `<div class="cand${sel}" data-cand="${i}">
      <span class="ctier">${tierLabel}</span>
      <div class="cname">${nm}</div>
      <div class="cinfo">${info}</div>
    </div>`;
  });

  const jobRows = JOB_NAMES.map(j => {
    let hint = "";
    if (j === "fisher") hint = `+${fmt(y.fish, 1)} food${G.jobs.fisher > isl.fishCap ? " (grounds crowded)" : ""}`;
    if (j === "farmer") hint = `+${fmt(y.farm, 1)} food${isl.drought > 0 ? " (drought)" : ""}`;
    if (j === "woodcutter") hint = `+${fmt(y.wood, 1)} wood`;
    if (j === "builder") hint = canoeFrac >= 1 ? "canoe ready" : `+${fmt(y.build, 1)} pts (${fmt(C.CANOE_WOOD_PER_PT * y.build, 1)} wood)`;
    if (j === "scout") hint = `+${fmt(y.scoutPts, 1)} lore`;
    if (j === "navigator") hint = `+${fmt(y.know, 1)} stars`;
    return `<div class="jobrow">
      <span class="jname">${JOB_LABELS[j]}</span>
      <button data-job="${j}" data-d="-1">−</button>
      <span class="jcount">${G.jobs[j]}</span>
      <button data-job="${j}" data-d="1">+</button>
      <span class="jhint">${hint}</span>
    </div>`;
  }).join("");

  $panel().innerHTML = `
    <h3>The People</h3>
    <div class="resbar">
      <span>People <b>${G.pop}</b><span style="color:var(--dim)">/${G.island.popCap}</span></span>
      <span>Food <b>${fmt(G.food)}</b> <span style="color:${foodNet >= 0 ? "var(--good)" : "var(--bad)"}">(${foodNet >= 0 ? "+" : ""}${fmt(foodNet, 1)})</span></span>
      <span>Wood <b>${fmt(G.wood)}</b></span>
      <span>Star lore <b>${fmt(G.knowledge)}</b></span>
      <span>Spirit <b>${fmt(G.morale)}</b></span>
    </div>
    <h3>Tasks <span style="float:right;color:var(--dim);text-transform:none;letter-spacing:0">idle: ${idleCount()}</span></h3>
    ${jobRows}
    <h3>The Great Canoe</h3>
    <div class="bar canoe"><div style="width:${fmt(canoeFrac * 100, 1)}%"></div></div>
    <div style="font-size:13px;color:var(--dim)">${canoeFrac >= 1
      ? "Hulls lashed, sail bent on. She is ready for the deep ocean."
      : `${fmt(G.canoe.progress)} / ${G.canoe.required} — builders need wood (${fmt(C.CANOE_WOOD_PER_PT, 1)} per point).`}</div>
    <h3>Lands Beyond</h3>
    <div style="font-size:12px;color:var(--dim)">Scouts study the sea-path of the highlighted land. Click a card to choose.</div>
    ${candHTML}
    <div class="btnrow">
      <button class="act primary" data-act="next">Next Moon ⏵</button>
    </div>
    <div class="btnrow">
      <button class="act" data-act="festival" ${G.food < G.pop ? "disabled" : ""}>Festival (${G.pop} food)</button>
      <button class="act" data-act="depart" ${canoeReady() ? "" : "disabled"}>Set Sail…</button>
    </div>
    ${logHTML()}
  `;
}

function renderVoyagePanel() {
  const v = G.voyage;
  const daysLeftGuess = Math.max(0, Math.round((v.dist - v.progress) / 1.0));
  const foodDays = v.crew > 0 ? v.food / (v.crew * C.SEA_EAT) : 0;
  $panel().innerHTML = `
    <h3>The Crossing</h3>
    <div class="resbar">
      <span>Crew <b>${v.crew}</b></span>
      <span>Food <b>${fmt(v.food)}</b></span>
      <span>Star lore <b>${fmt(G.knowledge)}</b></span>
      <span>Spirit <b>${fmt(G.morale)}</b></span>
    </div>
    <table class="stat-table">
      <tr><td>Day at sea</td><td>${v.day}</td></tr>
      <tr><td>Navigator's guess to landfall</td><td>~${daysLeftGuess} days</td></tr>
      <tr><td>Provisions last</td><td>~${fmt(foodDays)} days</td></tr>
    </table>
    <div class="btnrow">
      <button class="act primary" data-act="sail">Sail On ⏵ (1 day)</button>
      <button class="act" data-act="sail3">Sail 3 days ⏵⏵</button>
    </div>
    <div style="font-size:12px;color:var(--dim)">The navigator reads swell and stars. Keep food ahead of the days, and answer what the sea sends.</div>
    ${logHTML()}
  `;
}

// ---------- Overlay / modals ----------

let modalMode = null; // 'title' | 'event' | 'depart' | 'end' | null

function renderOverlay() {
  const ov = $overlay();
  if (G && G.pendingEvent) {
    modalMode = "event";
    const reg = G.pendingEvent.kind === "island" ? ISLAND_EVENTS : VOYAGE_EVENTS;
    const ev = reg[G.pendingEvent.id];
    ov.innerHTML = `<div class="modal">
      <h2>${ev.title}</h2>
      <p class="lore">${ev.text}</p>
      <div class="opts">${ev.options.map((o, i) =>
        `<button data-opt="${i}">${o.label}${o.hint ? `<small>${o.hint}</small>` : ""}</button>`).join("")}</div>
    </div>`;
    ov.classList.remove("hidden");
    return;
  }
  if (G && G.phase === "end") {
    showEndScreen();
    return;
  }
  if (modalMode === "event") { modalMode = null; ov.classList.add("hidden"); }
}

function showTitle(hasSave) {
  modalMode = "title";
  $overlay().innerHTML = `<div class="modal">
    <h2>Children of Hawaiki</h2>
    <p class="lore">"Let us follow the path of Kupe, the path of the long-voyaging ancestors, to the island where the sky-father set paradise — Hawaiʻi of the white mountains."</p>
    <p>Settle each island. Feed your people, fell trees for the great canoe, send scouts beyond the horizon, and let your navigators learn the stars. When you are ready — and provisioned — risk the crossing. Five voyages stand between Hawaiki and paradise.</p>
    <div class="opts">
      <button data-act="newgame">Begin the Voyage<small>A new line of navigators</small></button>
      ${hasSave ? `<button data-act="continue">Continue<small>Return to your people</small></button>` : ""}
    </div>
  </div>`;
  $overlay().classList.remove("hidden");
}

function showDepartModal() {
  modalMode = "depart";
  const maxCrew = Math.min(G.pop, C.CREW_MAX);
  const known = G.candidates.map((c, i) => ({ c, i }));
  $overlay().innerHTML = `<div class="modal">
    <h2>Set Sail</h2>
    <p class="lore">The canoe waits at the water line. Choose the heading, the crew, and the provisions. Those who stay will keep this island for your people.</p>
    <label>Destination</label>
    <div class="opts" id="dest-opts">${known.map(({ c, i }) =>
      `<button data-dest="${i}" class="${i === G.scoutTarget ? "sel" : ""}" style="${i === G.scoutTarget ? "border-color:var(--sand)" : ""}">
        ${c.tier > 0 || c.final ? c.name : "Unknown land"} — ${c.tier >= 1 || c.final ? `~${Math.round(c.tier >= 3 || c.final ? c.dist : c.estDist)} days` : "distance unknown"}
        <small>lore ${c.final ? "—" : c.tier + "/3"} · ${c.dirHint}</small>
      </button>`).join("")}</div>
    <label>Crew: <span class="slider-val" id="crew-val"></span> of ${G.pop} (canoe holds ${C.CREW_MAX})</label>
    <input type="range" id="crew-slider" min="${Math.min(2, maxCrew)}" max="${maxCrew}" value="${maxCrew}">
    <label>Provisions: <span class="slider-val" id="prov-val"></span> of ${Math.floor(G.food)} food</label>
    <input type="range" id="prov-slider" min="0" max="${Math.floor(G.food)}" value="${Math.floor(G.food)}">
    <p id="voyage-est"></p>
    <div class="opts">
      <button data-act="confirm-depart"><b>Cast off the lines</b><small>There is no turning back.</small></button>
      <button data-act="cancel-depart">Wait — we are not ready</button>
    </div>
  </div>`;
  $overlay().classList.remove("hidden");
  let destIdx = G.scoutTarget;
  const update = () => {
    const crew = +document.getElementById("crew-slider").value;
    const prov = +document.getElementById("prov-slider").value;
    document.getElementById("crew-val").textContent = crew;
    document.getElementById("prov-val").textContent = prov;
    const c = G.candidates[destIdx];
    const distGuess = c.final || c.tier >= 3 ? c.dist : (c.tier >= 1 ? c.estDist : null);
    const est = document.getElementById("voyage-est");
    if (distGuess) {
      const need = Math.ceil(distGuess * crew * C.SEA_EAT * 1.25);
      est.innerHTML = prov >= need
        ? `<span class="ok">The elders judge ${prov} food enough for ~${Math.round(distGuess)} days with margin for storms (≈${need} advised).</span>`
        : `<span class="warn">The elders advise ≈${need} food for this crossing. ${prov} may mean hunger at sea.</span>`;
    } else {
      est.innerHTML = `<span class="warn">No one knows how far this land lies. Provision heavily, or scout first.</span>`;
    }
    document.querySelectorAll("#dest-opts button").forEach(b => {
      b.style.borderColor = +b.dataset.dest === destIdx ? "var(--sand)" : "";
    });
  };
  document.getElementById("crew-slider").oninput = update;
  document.getElementById("prov-slider").oninput = update;
  update();
  document.querySelectorAll("#dest-opts button").forEach(b => {
    b.onclick = () => { destIdx = +b.dataset.dest; update(); };
  });
  document.querySelector("[data-act=confirm-depart]").onclick = () => {
    const crew = +document.getElementById("crew-slider").value;
    const prov = +document.getElementById("prov-slider").value;
    modalMode = null;
    $overlay().classList.add("hidden");
    depart(destIdx, crew, prov);
    renderAll();
  };
  document.querySelector("[data-act=cancel-depart]").onclick = () => {
    modalMode = null;
    $overlay().classList.add("hidden");
  };
}

function showEndScreen() {
  if (modalMode === "end") return;
  modalMode = "end";
  const e = G.end;
  let title, lore;
  if (e.won) {
    title = "Hawaiʻi!";
    lore = "Green mountains rise from the sea, taller than any story told of them. Waterfalls thread the cliffs and the air smells of rain and flowers. The navigator weeps, singing the arrival chant. Your people have crossed the great ocean — the legend is now yours, to be sung by every generation that follows.";
  } else if (e.reason === "sea") {
    title = "Taken by the Sea";
    lore = "The great canoe sails on in the songs of those left behind, but no fire is ever lit on a new shore. The ocean keeps what it takes. Yet others will follow the same stars — the dream of Hawaiʻi does not drown.";
  } else {
    title = "The Fires Go Out";
    lore = "Hunger and hard seasons end the settlement. The last canoes scatter to the winds. Somewhere, on other islands, your kin still tell of paradise beyond the horizon.";
  }
  const stats = `<table class="stat-table">
    <tr><td>Moons passed</td><td>${G.turn}</td></tr>
    <tr><td>Islands of the journey</td><td>${G.legacy.islands.join(" → ")}</td></tr>
    <tr><td>People settled along the way</td><td>${G.legacy.settled}</td></tr>
    <tr><td>Souls lost to the ocean</td><td>${G.legacy.crewLost}</td></tr>
    ${e.won ? `<tr><td>Souls reaching paradise</td><td>${G.pop}</td></tr>` : ""}
  </table>`;
  $overlay().innerHTML = `<div class="modal">
    <h2>${title}</h2>
    <p class="lore">${lore}</p>
    ${stats}
    <div class="opts"><button data-act="newgame">Voyage Again</button></div>
  </div>`;
  $overlay().classList.remove("hidden");
}

// ---------- Event wiring ----------

function bindUI() {
  $panel().addEventListener("click", (e) => {
    const b = e.target.closest("[data-job],[data-act],[data-cand]");
    if (!b) return;
    if (b.dataset.job) { adjustJob(b.dataset.job, +b.dataset.d); renderAll(); return; }
    if (b.dataset.cand != null) { G.scoutTarget = +b.dataset.cand; saveGame(); renderAll(); return; }
    switch (b.dataset.act) {
      case "next": endTurn(); break;
      case "festival": holdFestival(); break;
      case "depart": showDepartModal(); return;
      case "sail": sailDay(); break;
      case "sail3": for (let i = 0; i < 3; i++) sailDay(); break;
    }
    renderAll();
  });

  $overlay().addEventListener("click", (e) => {
    const b = e.target.closest("[data-opt],[data-act]");
    if (!b) return;
    if (b.dataset.opt != null) {
      resolvePendingEvent(+b.dataset.opt);
      modalMode = null;
      $overlay().classList.add("hidden");
      renderAll();
      return;
    }
    switch (b.dataset.act) {
      case "newgame":
        clearSave();
        newGame();
        modalMode = null;
        $overlay().classList.add("hidden");
        renderAll();
        break;
      case "continue":
        modalMode = null;
        $overlay().classList.add("hidden");
        renderAll();
        break;
    }
  });

  document.addEventListener("keydown", (e) => {
    if (modalMode || (G && G.pendingEvent)) return;
    if (e.code === "Space" || e.code === "Enter") {
      e.preventDefault();
      if (G.phase === "island") endTurn();
      else if (G.phase === "voyage") sailDay();
      renderAll();
    }
  });
}
