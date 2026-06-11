'use strict';

/* All DOM rendering and event handling. Reads Game.state, calls Game actions. */
const UI = (() => {

  let currentTab = 'dashboard';
  // Workshop form state (session-only, not saved).
  const workshop = { role: 'fighter', airframe: null, engine: null, avionics: null, weapon: null };

  const $ = (id) => document.getElementById(id);
  const fmt = Game.fmtNum;
  const money = (n) => '₽' + fmt(n);
  const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function dateStr(d) { return DATA.MONTHS[d.m - 1] + ' ' + d.y; }
  function pct(v) { return Math.round(v * 100) + '%'; }

  /* ---------- top-level render ---------- */

  function renderAll() {
    renderHeader();
    renderTab();
  }

  function renderHeader() {
    const s = Game.state;
    $('hdr-bureau').textContent = s.bureau.name;
    $('hdr-date').textContent = dateStr(s.date);
    const f = $('hdr-funds');
    f.textContent = money(s.bureau.funds);
    f.className = s.bureau.funds < 0 ? 'neg' : '';
    $('hdr-rep').textContent = 'Reputation ' + pct(s.bureau.reputation);
    $('btn-endmonth').disabled = !!s.gameOver;
  }

  function showTab(name) {
    currentTab = name;
    document.querySelectorAll('#tabs button').forEach(b =>
      b.classList.toggle('active', b.dataset.tab === name));
    renderTab();
  }

  function renderTab() {
    const renderers = {
      dashboard: renderDashboard,
      contracts: renderContracts,
      workshop: renderWorkshop,
      staff: renderStaff,
      research: renderResearch,
      fleet: renderFleet,
    };
    $('view').innerHTML = renderers[currentTab]();
    if (currentTab === 'contracts') {
      // populate previews for the default-selected design on each bid form
      for (const c of Game.state.contracts.available) {
        if ($(`bid-design-${c.id}`)) onBidInput(c.id);
      }
    }
  }

  /* ---------- shared fragments ---------- */

  function bar(frac, cls = '') {
    const w = Math.round(Math.min(1, Math.max(0, frac)) * 100);
    return `<div class="bar ${cls}"><div class="bar-fill" style="width:${w}%"></div></div>`;
  }

  function reqRow(label, req, unit, value) {
    let mark = '';
    if (value !== undefined) {
      mark = value >= req.target ? '<span class="ok">★</span>'
           : value >= req.min ? '<span class="ok">✓</span>'
           : '<span class="fail">✗</span>';
    }
    return `<tr><td>${label}</td><td>${fmt(req.min)} ${unit}</td><td>${fmt(req.target)} ${unit}</td>
            <td>${value !== undefined ? fmt(value) + ' ' + unit + ' ' + mark : '—'}</td></tr>`;
  }

  function logHtml(entries, limit) {
    if (!entries.length) return '<p class="muted">Nothing to report.</p>';
    return '<ul class="log">' + entries.slice(0, limit).map(e =>
      `<li class="log-${e.kind}"><span class="log-date">${DATA.MONTHS[e.m - 1].slice(0, 3)} ${e.y}</span> ${esc(e.msg)}</li>`
    ).join('') + '</ul>';
  }

  /* ---------- dashboard ---------- */

  function renderDashboard() {
    const s = Game.state;
    const est = Game.monthlyEstimate();
    const idle = Game.assignedTo('idle').length;

    const projects = s.projects.length ? s.projects.map(p => {
      const work = Game.projectMonthlyWork(p.id);
      const remaining = p.work - p.progress;
      const eta = work > 0 ? Math.ceil(remaining / work) : null;
      const late = p.elapsed > p.promised;
      const thumb = p.perf.componentIds ? `<span class="plane-thumb large">${Planes.svg(p.perf.componentIds, 72)}</span>` : '';
      return `<div class="card fleet-card">
        ${thumb}
        <div class="fleet-info">
          <div class="card-head"><b>${esc(p.aircraftName)}</b> — ${esc(p.contractName)}
            ${late ? '<span class="badge bad">LATE</span>' : ''}</div>
          ${bar(p.progress / p.work)}
          <div class="card-row">
            <span>Month ${p.elapsed} of ${p.promised} promised</span>
            <span>${Game.assignedTo('project', p.id).length} engineers</span>
            <span>${eta !== null ? '~' + eta + ' months to delivery' : '<b class="fail">No engineers assigned!</b>'}</span>
            <span>Payment ${money(p.price)}</span>
          </div>
        </div>
      </div>`;
    }).join('') : '<p class="muted">No active development projects. Win a contract on the Contracts board.</p>';

    const bids = s.contracts.pendingBids.length ? s.contracts.pendingBids.map(b =>
      `<div class="card"><b>${esc(b.contract.name)}</b> — proposed ${esc(b.designName)} at ${money(b.price)}, ` +
      `${b.months} months. Decision next month.</div>`).join('')
      : '<p class="muted">No proposals awaiting decision.</p>';

    return `
      <div class="stat-grid">
        <div class="stat"><span class="stat-label">Funds</span><span class="stat-value ${s.bureau.funds < 0 ? 'fail' : ''}">${money(s.bureau.funds)}</span></div>
        <div class="stat"><span class="stat-label">Est. monthly balance</span><span class="stat-value ${est.net < 0 ? 'fail' : 'ok'}">${est.net >= 0 ? '+' : ''}${money(est.net)}</span></div>
        <div class="stat"><span class="stat-label">Engineers</span><span class="stat-value">${s.staff.length}${idle ? ` <small class="muted">(${idle} idle)</small>` : ''}</span></div>
        <div class="stat"><span class="stat-label">Reputation</span><span class="stat-value">${pct(s.bureau.reputation)}</span></div>
        <div class="stat"><span class="stat-label">Contracts won / lost</span><span class="stat-value">${s.stats.bidsWon} / ${s.stats.bidsLost}</span></div>
        <div class="stat"><span class="stat-label">Aircraft delivered</span><span class="stat-value">${s.stats.completed}</span></div>
        <div class="stat"><span class="stat-label">Combat record</span><span class="stat-value">${s.stats.victories} kills · ${s.stats.lossesCombat} lost</span></div>
        ${s.stats.targets ? `<div class="stat"><span class="stat-label">Targets destroyed</span><span class="stat-value">${fmt(s.stats.targets)}</span></div>` : ''}
      </div>

      <div class="cols">
        <section>
          <h2>Active Projects</h2>${projects}
          <h2>Pending Proposals</h2>${bids}
          <h2>War Fronts</h2>${warFronts()}
          <h2>Monthly Finances (estimate)</h2>
          <table class="data">
            <tr><td>Fleet support income</td><td class="num ok">+${money(est.maintIncome)}</td></tr>
            <tr><td>Salaries (${s.staff.length} engineers)</td><td class="num fail">−${money(est.salaries)}</td></tr>
            <tr><td>Facility overhead</td><td class="num fail">−${money(est.overhead)}</td></tr>
            <tr><td>Prototype development</td><td class="num fail">−${money(est.protoBurn)}</td></tr>
            <tr class="total"><td>Net (before contract payments)</td><td class="num ${est.net < 0 ? 'fail' : 'ok'}">${est.net >= 0 ? '+' : '−'}${money(Math.abs(est.net))}</td></tr>
          </table>
        </section>
        <section>
          <h2>Bureau Log</h2>${logHtml(s.log, 25)}
        </section>
      </div>`;
  }

  function warFronts() {
    const s = Game.state;
    const wars = Game.activeConflicts();
    if (!wars.length) return '<p class="muted">The world is quiet. For now.</p>';
    const t = s.date.y * 12 + (s.date.m - 1);
    return wars.map(c => {
      const monthsLeft = c.start.y * 12 + (c.start.m - 1) + c.months - t;
      const demand = Object.entries(c.roles).filter(([, w]) => w >= 0.3)
        .map(([r]) => DATA.TYPES[r].label + 's').join(', ') || 'limited air involvement';
      const engaged = s.fleet.filter(a => (c.roles[a.type] || 0) > 0).length;
      return `<div class="card war">
        <div class="card-head"><b>${esc(c.name)}</b>
          <span class="badge war">Intensity ${Math.round(c.intensity * 100)}%</span></div>
        <div class="card-row">
          <span>In demand: ${demand}</span>
          <span>~${monthsLeft} month${monthsLeft > 1 ? 's' : ''} remaining</span>
          <span>${engaged ? engaged + ' of our types exposed' : 'none of our aircraft engaged'}</span>
        </div>
      </div>`;
    }).join('');
  }

  /* ---------- contracts ---------- */

  function renderContracts() {
    const s = Game.state;
    const cards = s.contracts.available.map(c => {
      const pending = s.contracts.pendingBids.find(b => b.contractId === c.id);
      const designs = s.designs.filter(d => d.perf.role === c.type);
      const r = c.requirements;

      let bidUi;
      if (pending) {
        bidUi = `<div class="bid-pending">Proposal submitted: <b>${esc(pending.designName)}</b> at ${money(pending.price)}, ${pending.months} months.
          <button onclick="UI.onWithdrawBid('${c.id}')">Withdraw</button></div>`;
      } else if (!designs.length) {
        bidUi = `<p class="muted">No ${DATA.TYPES[c.type].label.toLowerCase()} designs available — create one in the Workshop.</p>`;
      } else {
        const opts = designs.map(d => `<option value="${d.id}">${esc(d.name)}</option>`).join('');
        const defPrice = Math.round(c.budget * 0.85);
        const defMonths = Math.max(3, c.deadline - 2);
        bidUi = `<div class="bid-form">
          <label>Design <select id="bid-design-${c.id}" onchange="UI.onBidInput('${c.id}')">${opts}</select></label>
          <label>Price ₽ <input id="bid-price-${c.id}" type="number" step="100000" min="0" value="${defPrice}" oninput="UI.onBidInput('${c.id}')"></label>
          <label>Timeline (months) <input id="bid-months-${c.id}" type="number" min="3" max="48" value="${defMonths}" oninput="UI.onBidInput('${c.id}')"></label>
          <button class="primary" onclick="UI.onSubmitBid('${c.id}')">Submit Proposal</button>
          <div id="bid-preview-${c.id}" class="bid-preview"></div>
        </div>`;
      }

      return `<div class="card contract">
        <div class="card-head">
          <b>${esc(c.name)}</b>
          <span class="badge">${DATA.TYPES[c.type].label}</span>
          <span class="badge diff-${c.difficulty}">${c.difficulty}</span>
          <span class="muted">closes in ${c.expiresIn} month${c.expiresIn > 1 ? 's' : ''}</span>
        </div>
        <table class="data reqs" id="reqs-${c.id}">
          <tr><th></th><th>Minimum</th><th>Target</th><th>Selected design</th></tr>
          ${reqRow('Speed', r.speed, 'km/h')}
          ${reqRow('Range', r.range, 'km')}
          ${reqRow('Payload', r.payload, 'kg')}
        </table>
        <div class="card-row">
          <span>Budget: <b>${money(c.budget)}</b></span>
          <span>Max unit cost: <b>${money(r.unitCostMax)}</b></span>
          <span>Deadline: <b>${c.deadline} months</b></span>
          <span>Competing: ${c.bidders.map(esc).join(', ') || 'nobody'}</span>
        </div>
        ${bidUi}
      </div>`;
    }).join('');

    return `<h2>Open Tenders</h2>
      <p class="muted">The commission weighs technical compliance 60%, price 25%, timeline 15%. Reputation colors everything. Decisions arrive one month after submission.</p>
      ${cards || '<p class="muted">No open tenders this month. End the month to see new ones.</p>'}`;
  }

  function readBidForm(cid) {
    const designId = $(`bid-design-${cid}`)?.value;
    const price = Number($(`bid-price-${cid}`)?.value);
    const months = Number($(`bid-months-${cid}`)?.value);
    return { designId, price, months };
  }

  function onBidInput(cid) {
    const s = Game.state;
    const c = s.contracts.available.find(x => x.id === cid);
    const { designId, price, months } = readBidForm(cid);
    const design = s.designs.find(d => d.id === designId);
    const preview = $(`bid-preview-${cid}`);
    if (!c || !design || !preview) return;

    const ev = Game.evaluateBid(design.perf, c, price || 0, months || c.deadline);
    const verdict = ev.final >= 0.72 ? ['Strong', 'ok'] : ev.final >= 0.58 ? ['Competitive', 'mid'] : ['Weak', 'fail'];
    const devCost = design.perf.cost * DATA.PROTO_MULT;
    const margin = (price || 0) - devCost;
    preview.innerHTML =
      `Commission appeal: <b class="${verdict[1]}">${verdict[0]}</b> · ` +
      `technical ${pct(ev.tech)}, price ${pct(ev.priceScore)}, timeline ${pct(ev.timeScore)}` +
      (design.perf.cost > c.requirements.unitCostMax ? ' · <span class="fail">unit cost over limit!</span>' : '') +
      `<br>Est. development cost ${money(devCost)} → projected margin <b class="${margin >= 0 ? 'ok' : 'fail'}">${margin >= 0 ? '+' : '−'}${money(Math.abs(margin))}</b>`;

    // refresh the requirements table with the selected design's numbers
    const r = c.requirements;
    $(`reqs-${cid}`).innerHTML =
      `<tr><th></th><th>Minimum</th><th>Target</th><th>Selected design</th></tr>
       ${reqRow('Speed', r.speed, 'km/h', design.perf.speed)}
       ${reqRow('Range', r.range, 'km', design.perf.range)}
       ${reqRow('Payload', r.payload, 'kg', design.perf.payload)}`;
  }

  function onSubmitBid(cid) {
    const { designId, price, months } = readBidForm(cid);
    const res = Game.submitBid(cid, designId, price, months);
    if (!res.ok) alert(res.error);
    renderAll();
  }

  function onWithdrawBid(cid) {
    Game.withdrawBid(cid);
    renderAll();
  }

  /* ---------- workshop ---------- */

  function compOptions(key, selectedId) {
    const list = Game.unlockedComponents(key, key === 'airframe' ? workshop.role : null);
    return list.map(c => {
      let stats;
      if (key === 'airframe') stats = `${c.baseSpeed} km/h · ${c.baseRange} km · ${fmt(c.payload)} kg`;
      else if (key === 'engine') stats = `speed ×${c.speedMult} · range ×${c.rangeMult}`;
      else if (key === 'avionics') stats = `combat +${c.combat}`;
      else stats = `firepower ${c.firepower}${c.drag ? ' · drag −' + c.drag * 3 + '%' : ''}`;
      return `<option value="${c.id}" ${c.id === selectedId ? 'selected' : ''}>${esc(c.name)} — ${stats} — ${money(c.cost)}</option>`;
    }).join('');
  }

  function ensureWorkshopDefaults() {
    for (const key of ['airframe', 'engine', 'avionics', 'weapon']) {
      const list = Game.unlockedComponents(key, key === 'airframe' ? workshop.role : null);
      if (!workshop[key] || !list.some(c => c.id === workshop[key])) {
        // combat aircraft default to armed; transports to unarmed
        workshop[key] = (key === 'weapon' && workshop.role !== 'transport' && list.length > 1)
          ? list[1].id : list[0].id;
      }
    }
  }

  function renderWorkshop() {
    const s = Game.state;
    ensureWorkshopDefaults();
    const perf = Game.calcPerformance({
      airframe: workshop.airframe, engine: workshop.engine,
      avionics: workshop.avionics, weapon: workshop.weapon,
    });

    const designRows = s.designs.map(d => `<tr>
      <td><span class="plane-thumb">${Planes.svg(d.perf.componentIds, 52)}</span></td>
      <td><b>${esc(d.name)}</b></td><td>${DATA.TYPES[d.perf.role].label}</td>
      <td class="num">${fmt(d.perf.speed)}</td><td class="num">${fmt(d.perf.range)}</td>
      <td class="num">${fmt(d.perf.payload)}</td><td class="num">${d.perf.firepower}</td>
      <td class="num">${pct(d.perf.reliability)}</td><td class="num">${money(d.perf.cost)}</td>
      <td><button onclick="UI.onDeleteDesign('${d.id}')">Scrap</button></td>
    </tr>`).join('');

    return `
      <div class="cols">
        <section>
          <h2>Design Workshop</h2>
          <div class="card">
            <label>Designation <input id="ws-name" type="text" placeholder="RSB-${s.designs.length + 1}" value="RSB-${s.designs.length + 1}"></label>
            <label>Role
              <select id="ws-role" onchange="UI.onWorkshopRole(this.value)">
                ${Object.entries(DATA.TYPES).map(([k, t]) =>
                  `<option value="${k}" ${k === workshop.role ? 'selected' : ''}>${t.label}</option>`).join('')}
              </select>
            </label>
            <label>Airframe <select id="ws-airframe" onchange="UI.onWorkshopComp('airframe', this.value)">${compOptions('airframe', workshop.airframe)}</select></label>
            <label>Engine <select id="ws-engine" onchange="UI.onWorkshopComp('engine', this.value)">${compOptions('engine', workshop.engine)}</select></label>
            <label>Avionics <select id="ws-avionics" onchange="UI.onWorkshopComp('avionics', this.value)">${compOptions('avionics', workshop.avionics)}</select></label>
            <label>Armament <select id="ws-weapon" onchange="UI.onWorkshopComp('weapon', this.value)">${compOptions('weapon', workshop.weapon)}</select></label>
            <button class="primary" onclick="UI.onSaveDesign()">Approve Design</button>
          </div>
        </section>
        <section>
          <h2>Projected Performance</h2>
          <div class="plane-box">${Planes.svg(perf.componentIds, 230)}</div>
          <table class="data perf">
            <tr><td>Max speed</td><td class="num">${fmt(perf.speed)} km/h</td></tr>
            <tr><td>Range</td><td class="num">${fmt(perf.range)} km</td></tr>
            <tr><td>Payload</td><td class="num">${fmt(perf.payload)} kg</td></tr>
            <tr><td>Firepower</td><td class="num">${perf.firepower}</td></tr>
            <tr><td>Reliability</td><td class="num">${pct(perf.reliability)}</td></tr>
            <tr class="total"><td>Unit cost</td><td class="num">${money(perf.cost)}</td></tr>
          </table>
          <p class="muted">Higher-tier components come from the Research Lab. Drag from heavy armament trims speed and range.</p>
        </section>
      </div>
      <h2>Approved Designs</h2>
      ${s.designs.length ? `<table class="data wide">
        <tr><th></th><th>Name</th><th>Role</th><th>Speed</th><th>Range</th><th>Payload</th><th>Firepower</th><th>Reliability</th><th>Unit cost</th><th></th></tr>
        ${designRows}</table>` : '<p class="muted">No designs on file.</p>'}`;
  }

  function onWorkshopRole(role) {
    workshop.role = role;
    workshop.airframe = null; // re-pick a valid airframe for the new role
    renderTab();
  }

  function onWorkshopComp(key, id) {
    workshop[key] = id;
    renderTab();
  }

  function onSaveDesign() {
    const name = $('ws-name').value;
    const res = Game.createDesign(name, {
      airframe: workshop.airframe, engine: workshop.engine,
      avionics: workshop.avionics, weapon: workshop.weapon,
    });
    if (!res.ok) alert(res.error);
    renderTab();
  }

  function onDeleteDesign(id) {
    if (!confirm('Scrap this design? Aircraft already in development or service are unaffected.')) return;
    Game.deleteDesign(id);
    renderTab();
  }

  /* ---------- staff ---------- */

  function assignmentOptions(eng) {
    const s = Game.state;
    const cur = eng.assignment;
    const opt = (code, label, selected) =>
      `<option value="${code}" ${selected ? 'selected' : ''}>${esc(label)}</option>`;
    let html = opt('idle', '— Idle —', cur.type === 'idle');
    for (const p of s.projects) {
      html += opt('project:' + p.id, 'Project: ' + p.aircraftName, cur.type === 'project' && cur.id === p.id);
    }
    for (const nodeId of Object.keys(s.tech.active)) {
      html += opt('research:' + nodeId, 'Research: ' + Game.techNode(nodeId).name,
        cur.type === 'research' && cur.id === nodeId);
    }
    html += opt('maintenance', 'Maintenance Pool', cur.type === 'maintenance');
    return html;
  }

  function renderStaff() {
    const s = Game.state;
    const payroll = s.staff.reduce((sum, e) => sum + e.salary, 0);
    const demand = Game.maintenanceDemand();
    const capacity = Game.maintenanceCapacity();

    const rows = s.staff.map(e => `<tr>
      <td><b>${esc(e.name)}</b></td>
      <td>${DATA.LEVELS[e.level].label}</td>
      <td>${DATA.SPEC_LABELS[e.spec]}</td>
      <td class="num">${pct(e.efficiency)}</td>
      <td class="num">${money(e.salary)}</td>
      <td><select onchange="UI.onAssign('${e.id}', this.value)">${assignmentOptions(e)}</select></td>
      <td><button onclick="UI.onFire('${e.id}')">Dismiss</button></td>
    </tr>`).join('');

    const pool = s.hirePool.map((c, i) => `<div class="card">
      <b>${esc(c.name)}</b> — ${DATA.LEVELS[c.level].label}, ${DATA.SPEC_LABELS[c.spec]}<br>
      Efficiency ${pct(c.efficiency)} · Salary ${money(c.salary)}/mo · Signing bonus ${money(c.salary * 3)}
      <button class="primary" onclick="UI.onHire(${i})">Hire</button>
    </div>`).join('');

    return `
      <div class="stat-grid">
        <div class="stat"><span class="stat-label">Monthly payroll</span><span class="stat-value">${money(payroll)}</span></div>
        <div class="stat"><span class="stat-label">Design output</span><span class="stat-value">${s.projects.reduce((sum, p) => sum + Game.projectMonthlyWork(p.id), 0).toFixed(1)} pts/mo</span></div>
        <div class="stat"><span class="stat-label">Maintenance</span><span class="stat-value ${capacity < demand ? 'fail' : 'ok'}">${capacity.toFixed(1)} / ${demand} needed</span></div>
        <div class="stat"><span class="stat-label">Idle engineers</span><span class="stat-value">${Game.assignedTo('idle').length}</span></div>
      </div>
      <h2>Engineer Roster</h2>
      <table class="data wide">
        <tr><th>Name</th><th>Level</th><th>Specialization</th><th>Efficiency</th><th>Salary</th><th>Assignment</th><th></th></tr>
        ${rows}
      </table>
      <p class="muted">Specialists work faster in their field: aerodynamics/structures boost design work, matching specialists boost research ×1.5, maintenance specialists count ×1.5 in the maintenance pool.</p>
      <h2>Recruitment <small class="muted">(new candidates in ${s.hirePoolRefresh} month${s.hirePoolRefresh > 1 ? 's' : ''})</small></h2>
      <div class="card-grid">${pool || '<p class="muted">No candidates available.</p>'}</div>`;
  }

  function onAssign(engId, code) {
    Game.assign(engId, code);
    renderAll();
  }

  function onHire(idx) {
    const res = Game.hire(idx);
    if (!res.ok) alert(res.error);
    renderAll();
  }

  function onFire(engId) {
    const eng = Game.state.staff.find(e => e.id === engId);
    if (!eng) return;
    if (!confirm(`Dismiss ${eng.name}? Severance: ${money(eng.salary * 3)}.`)) return;
    Game.fire(engId);
    renderAll();
  }

  /* ---------- research ---------- */

  function componentName(cid) {
    for (const list of [DATA.AIRFRAMES, DATA.ENGINES, DATA.AVIONICS, DATA.WEAPONS]) {
      const c = list.find(x => x.id === cid);
      if (c) return c.name;
    }
    return cid;
  }

  function renderResearch() {
    const s = Game.state;
    // tree layout geometry
    const CW = 196, CH = 108, GX = 56, GY = 24, X0 = 92, Y0 = 12;
    const cols = Math.max(...DATA.TECH_NODES.map(n => n.col)) + 1;
    const rows = Math.max(...DATA.TECH_NODES.map(n => n.row)) + 1;
    const W = X0 + cols * (CW + GX) - GX + 12;
    const H = Y0 + rows * (CH + GY) - GY + 12;
    const px = (n) => X0 + n.col * (CW + GX);
    const py = (n) => Y0 + n.row * (CH + GY);

    // prerequisite connectors
    let lines = '';
    for (const n of DATA.TECH_NODES) {
      for (const reqId of n.requires) {
        const r = Game.techNode(reqId);
        const done = Game.isResearched(reqId);
        let d;
        if (r.col === n.col) {
          // same column: connect vertically (bottom of prereq to top of dependent)
          const x1 = px(r) + CW / 2, y1 = py(r) + CH;
          const x2 = px(n) + CW / 2, y2 = py(n);
          d = `M ${x1} ${y1} C ${x1} ${y1 + GY * 0.7}, ${x2} ${y2 - GY * 0.7}, ${x2} ${y2}`;
        } else {
          const x1 = px(r) + CW, y1 = py(r) + CH / 2;
          const x2 = px(n), y2 = py(n) + CH / 2;
          d = `M ${x1} ${y1} C ${x1 + GX * 0.7} ${y1}, ${x2 - GX * 0.7} ${y2}, ${x2} ${y2}`;
        }
        lines += `<path d="${d}" fill="none" stroke="${done ? '#3a7d3a' : '#b6a98c'}" stroke-width="2"
          ${done ? '' : 'stroke-dasharray="5,4"'}/>`;
      }
    }
    const rowLabels = DATA.TECH_ROWS.map((label, i) =>
      `<text x="6" y="${Y0 + i * (CH + GY) + CH / 2 + 5}" class="tree-row-label">${label.toUpperCase()}</text>`).join('');

    // node cards
    const cards = DATA.TECH_NODES.map(n => {
      const active = s.tech.active[n.id];
      const done = Game.isResearched(n.id);
      const avail = Game.nodeAvailable(n);
      const status = done ? 'done' : active ? 'active' : avail ? 'avail' : 'locked';
      const unlocks = n.unlocks.map(cid => esc(componentName(cid))).join(', ');

      let body;
      if (done) {
        body = `<div class="tech-status ok">✓ Researched</div>`;
      } else if (active) {
        const out = Game.researchMonthlyWork(n.id);
        const eta = out > 0 ? '~' + Math.ceil((active.work - active.progress) / out) + ' mo' : '<span class="fail">no engineers!</span>';
        body = `${bar(active.progress / active.work, 'research')}
          <div class="tech-status">${Game.assignedTo('research', n.id).length} engineers · ${eta}</div>`;
      } else if (avail) {
        body = `<button class="primary tech-btn" onclick="UI.onStartResearch('${n.id}')"
          ${s.bureau.funds < n.cost ? 'disabled' : ''}>Begin — ${money(n.cost)}</button>`;
      } else {
        const missing = n.requires.filter(r => !Game.isResearched(r)).map(r => esc(Game.techNode(r).name));
        body = `<div class="tech-status muted">Requires: ${missing.join(', ')}</div>`;
      }

      return `<div class="tech-node ${status}" style="left:${px(n)}px;top:${py(n)}px;width:${CW}px;height:${CH}px">
        <div class="tech-name">${esc(n.name)}</div>
        <div class="tech-unlocks">${unlocks}</div>
        <div class="tech-meta">${money(n.cost)} · ${n.work} eng-months</div>
        ${body}
      </div>`;
    }).join('');

    return `<h2>Research Tree <small class="muted">(${s.tech.researched.length} / ${DATA.TECH_NODES.length} technologies)</small></h2>
      <p class="muted">Costs are paid up front; progress requires engineers assigned via the Staff tab. Several projects can run in parallel.
      Matching specialists research half again as fast. Dashed links are prerequisites not yet met.</p>
      <div class="tree-wrap">
        <div class="tech-tree" style="width:${W}px;height:${H}px">
          <svg class="tree-links" width="${W}" height="${H}">${lines}${rowLabels}</svg>
          ${cards}
        </div>
      </div>`;
  }

  function onStartResearch(nodeId) {
    const res = Game.startResearch(nodeId);
    if (!res.ok) alert(res.error);
    renderAll();
  }

  /* ---------- fleet ---------- */

  function renderFleet() {
    const s = Game.state;
    const coverage = Game.maintenanceCoverage();
    const demand = Game.maintenanceDemand();
    const capacity = Game.maintenanceCapacity();

    const cards = s.fleet.map(a => {
      const income = Game.fleetIncome(a, coverage);
      const thumb = a.componentIds ? `<span class="plane-thumb large">${Planes.svg(a.componentIds, 84)}</span>` : '';
      return `<div class="card fleet-card">
        ${thumb}
        <div class="fleet-info">
          <div class="card-head"><b>${esc(a.name)}</b> <span class="badge">${DATA.TYPES[a.type].label}</span>
            <span class="muted">in service since ${a.enteredYear}</span></div>
          <div class="card-row">
            <span>${fmt(a.units)} units</span>
            <span>Effectiveness ${pct(a.effectiveness)}</span>
            <span>Support income ${money(income)}/mo</span>
            <span>Needs ${a.maintDemand} maintenance engineers</span>
            <span>${Math.floor(a.serviceMonths / 12)}y ${a.serviceMonths % 12}m service remaining</span>
          </div>
          ${combatRecord(a)}
          <button onclick="UI.onRetire('${a.id}')">Withdraw from service</button>
        </div>
      </div>`;
    }).join('');

    const covCls = coverage >= 0.99 ? 'ok' : coverage >= 0.6 ? 'mid' : 'fail';
    return `<h2>Aircraft in Service</h2>
      ${s.fleet.length ? `
        <div class="card">
          <b>Fleet maintenance coverage: <span class="${covCls}">${pct(coverage)}</span></b>
          (${capacity.toFixed(1)} capacity vs ${demand} needed)
          ${bar(coverage, covCls === 'fail' ? 'danger' : '')}
          <p class="muted">Low coverage cuts support income and risks crashes that stain our reputation. Assign engineers to the Maintenance Pool in the Staff tab, or withdraw aging types.</p>
        </div>` : ''}
      ${cards || '<p class="muted">No aircraft in service yet. Deliver a contract to start earning support income.</p>'}`;
  }

  function combatRecord(a) {
    const cb = a.combat;
    if (!cb || !cb.conflicts.length) return '';
    const parts = [];
    if (cb.victories) parts.push(`${fmt(cb.victories)} aerial victories`);
    if (cb.targets) parts.push(`${fmt(cb.targets)} targets destroyed`);
    if (cb.tonnage) parts.push(`${fmt(cb.tonnage)} t delivered`);
    parts.push(cb.losses ? `${fmt(cb.losses)} lost in action` : 'no combat losses');
    return `<div class="card-row combat-record">
      <span>⚔ ${parts.join(' · ')}</span>
      <span class="muted">${cb.conflicts.map(esc).join(', ')}</span>
    </div>`;
  }

  function onRetire(id) {
    const a = Game.state.fleet.find(x => x.id === id);
    if (!a) return;
    if (!confirm(`Withdraw the ${a.name} from service? Support income ends permanently.`)) return;
    Game.retireAircraft(id);
    renderAll();
  }

  /* ---------- month end & modals ---------- */

  function onEndMonth() {
    const report = Game.endMonth();
    if (!report) return;
    renderAll();
    const s = Game.state;
    if (s.gameOver) { showGameOver(); return; }

    const deltaCls = report.delta >= 0 ? 'ok' : 'fail';
    showModal(`<h2>${dateStr(s.date)}</h2>
      <p>Net change this month: <b class="${deltaCls}">${report.delta >= 0 ? '+' : '−'}${money(Math.abs(report.delta))}</b></p>
      ${logHtml(report.events.slice().reverse(), 15)}
      <button class="primary" onclick="UI.closeModal()">Continue</button>`);
  }

  function showGameOver() {
    const s = Game.state;
    const go = s.gameOver;
    let body;
    if (go.type === 'bankruptcy') {
      body = `<h2>Bureau Liquidated</h2>
        <p>The State Bank has called in our debts. Our drafting tables are carted off to Mikoyan-Gurevich,
        and your name is quietly removed from the ministry directory.</p>`;
    } else if (go.type === 'disgrace') {
      body = `<h2>Bureau Dissolved</h2>
        <p>Too many failures. The Ministry of Aviation Industry has dissolved the bureau
        "for systematic non-fulfillment of state obligations."</p>`;
    } else {
      const combat = (s.stats.victories || s.stats.targets || s.stats.tonnage)
        ? `<p>In the wars of the era our aircraft claimed <b>${fmt(s.stats.victories)}</b> aerial victories,
           destroyed <b>${fmt(s.stats.targets)}</b> targets, delivered <b>${fmt(s.stats.tonnage)}</b> tonnes of cargo,
           and lost <b>${fmt(s.stats.lossesCombat)}</b> machines in action.</p>`
        : '<p>Our aircraft never fired a shot in anger.</p>';
      body = `<h2>Fifteen-Year Review — ${DATA.END_YEAR}</h2>
        <p>The Ministry assesses our record: <b>${s.stats.completed}</b> aircraft delivered,
        <b>${s.stats.bidsWon}</b> tenders won, treasury of <b>${money(s.bureau.funds)}</b>,
        reputation <b>${pct(s.bureau.reputation)}</b>.</p>
        ${combat}
        <p class="verdict">Verdict: <b>${go.grade}</b> <span class="muted">(score ${go.score})</span></p>`;
    }
    showModal(body + `<button class="primary" onclick="UI.onNewGame(true)">Found a New Bureau</button>`);
  }

  function showModal(html) {
    $('modal-root').innerHTML = `<div class="modal-backdrop"><div class="modal">${html}</div></div>`;
  }

  function closeModal() {
    $('modal-root').innerHTML = '';
  }

  function onNewGame(force) {
    if (!force && !confirm('Abandon the current bureau and start over?')) return;
    Game.reset();
    Game.newGame();
    closeModal();
    showTab('dashboard');
    renderAll();
  }

  /* ---------- init ---------- */

  function init() {
    if (!Game.load()) Game.newGame();
    document.querySelectorAll('#tabs button').forEach(b =>
      b.addEventListener('click', () => showTab(b.dataset.tab)));
    $('btn-endmonth').addEventListener('click', onEndMonth);
    $('btn-newgame').addEventListener('click', () => onNewGame(false));
    renderAll();
    if (Game.state.gameOver) showGameOver();
  }

  return {
    init, showTab, renderAll, closeModal,
    onEndMonth, onNewGame,
    onBidInput, onSubmitBid, onWithdrawBid,
    onWorkshopRole, onWorkshopComp, onSaveDesign, onDeleteDesign,
    onAssign, onHire, onFire,
    onStartResearch, onRetire,
  };
})();

document.addEventListener('DOMContentLoaded', UI.init);
