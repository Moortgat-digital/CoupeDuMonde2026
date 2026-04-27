const { teams, matches, flagCodes } = window.APP_DATA;
const adminSecretStorageKey = "cdm2026-admin-secret";

const defaultState = {
  selectedParticipant: "",
  predictions: {},
  results: {},
  teamProgress: {},
  matchOverrides: {},
};

let state = structuredClone(defaultState);
const adminGroupBody = document.querySelector("#adminGroupBody");
const adminKnockoutBody = document.querySelector("#adminKnockoutBody");
const knockoutSetup = document.querySelector("#knockoutSetup");
const teamProgress = document.querySelector("#teamProgress");
const adminSecret = document.querySelector("#adminSecret");
const toast = document.querySelector("#toast");

init();

document.querySelector("#saveAdmin").addEventListener("click", saveAdmin);
document.addEventListener("input", handleScoreInput);
document.addEventListener("click", handleClearResult);

async function init() {
  adminSecret.value = localStorage.getItem(adminSecretStorageKey) || "";
  await loadRemoteState();
  renderAdmin();
  renderKnockoutSetup();
  renderTeamProgress();
}

async function loadRemoteState() {
  try {
    const response = await fetch("/api/state", { cache: "no-store" });
    if (!response.ok) throw new Error("Impossible de charger les données partagées");
    state = { ...structuredClone(defaultState), ...(await response.json()) };
  } catch {
    state = structuredClone(defaultState);
    showToast("Données partagées indisponibles");
  }
}

function renderAdmin() {
  const rows = getConfiguredMatches()
    .map((match) => {
      const result = state.results[match.id] || {};
      return {
        stage: match.stage,
        html: `
        <tr>
          <td>${phaseBadge(match.phase)}</td>
          <td>${formatDate(match.kickoff)} ${formatTime(match.kickoff)}</td>
          <td><strong>${teamName(match.home)} - ${teamName(match.away)}</strong></td>
          <td>
            <div class="score-inputs">
              <input type="number" min="0" max="30" data-result-home="${match.id}" value="${valueOrEmpty(result.homeScore)}">
              <span>-</span>
              <input type="number" min="0" max="30" data-result-away="${match.id}" value="${valueOrEmpty(result.awayScore)}">
            </div>
          </td>
          <td colspan="${match.stage === "knockout" ? "2" : "1"}">${match.stage === "knockout" ? knockoutDecisionControls(match, result, false, "result") : "-"}</td>
          ${match.stage === "knockout" ? "" : "<td>-</td>"}
          <td><button class="ghost-danger" type="button" data-clear-result="${match.id}">Effacer</button></td>
        </tr>
      `,
      };
    });

  adminGroupBody.innerHTML = rows.filter((row) => row.stage === "group").map((row) => row.html).join("");
  adminKnockoutBody.innerHTML = rows.filter((row) => row.stage === "knockout").map((row) => row.html).join("");
}

function renderKnockoutSetup() {
  knockoutSetup.innerHTML = matches
    .filter((match) => match.stage === "knockout")
    .map((match) => {
      const configured = { ...match, ...(state.matchOverrides[match.id] || {}) };
      return `
        <article class="setup-card">
          <h2>${escapeHtml(match.phase)} - ${escapeHtml(match.id)}</h2>
          <label>
            Équipe 1
            ${teamSelect(`data-match-home="${match.id}"`, configured.home)}
          </label>
          <label>
            Équipe 2
            ${teamSelect(`data-match-away="${match.id}"`, configured.away)}
          </label>
        </article>
      `;
    })
    .join("");
}

function renderTeamProgress() {
  teamProgress.innerHTML = teams
    .map((team) => {
      const selected = state.teamProgress[team] || "none";
      return `
        <label>
          ${escapeHtml(team)}
          <select data-team-progress="${escapeHtml(team)}">
            <option value="none" ${selected === "none" ? "selected" : ""}>Non qualifiée</option>
            <option value="r32" ${selected === "r32" ? "selected" : ""}>Qualifiée en 1/16</option>
            <option value="r16" ${selected === "r16" ? "selected" : ""}>Qualifiée en 1/8</option>
            <option value="qf" ${selected === "qf" ? "selected" : ""}>Qualifiée en 1/4</option>
            <option value="sf" ${selected === "sf" ? "selected" : ""}>Qualifiée en 1/2</option>
            <option value="final" ${selected === "final" ? "selected" : ""}>Finaliste</option>
            <option value="champion" ${selected === "champion" ? "selected" : ""}>Championne</option>
          </select>
        </label>
      `;
    })
    .join("");
}

async function saveAdmin() {
  localStorage.setItem(adminSecretStorageKey, adminSecret.value);

  getConfiguredMatches().forEach((match) => {
    const result = {
      homeScore: readNumber(`[data-result-home="${match.id}"]`),
      awayScore: readNumber(`[data-result-away="${match.id}"]`),
    };

    if (!hasScore(result)) {
      delete state.results[match.id];
      return;
    }

    if (match.stage === "knockout") {
      Object.assign(result, readKnockoutDecision(match, result, "result"));
    }

    state.results[match.id] = result;
  });

  matches
    .filter((match) => match.stage === "knockout")
    .forEach((match) => {
      state.matchOverrides[match.id] = {
        home: document.querySelector(`[data-match-home="${match.id}"]`)?.value || match.home,
        away: document.querySelector(`[data-match-away="${match.id}"]`)?.value || match.away,
      };
    });

  teams.forEach((team) => {
    state.teamProgress[team] = document.querySelector(`[data-team-progress="${cssEscape(team)}"]`)?.value || "none";
  });

  try {
    const response = await fetch("/api/state", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-secret": adminSecret.value,
      },
      body: JSON.stringify({
        action: "saveAdmin",
        results: state.results,
        teamProgress: state.teamProgress,
        matchOverrides: state.matchOverrides,
      }),
    });

    if (response.status === 401) throw new Error("Code admin incorrect");
    if (!response.ok) throw new Error("Erreur d'enregistrement");

    state = { ...structuredClone(defaultState), ...(await response.json()) };
    renderAdmin();
    renderKnockoutSetup();
    showToast("Administration enregistrée");
  } catch (error) {
    showToast(error.message || "Enregistrement impossible");
  }
}

function getConfiguredMatches() {
  return matches.map((match) => ({
    ...match,
    ...(state.matchOverrides?.[match.id] || {}),
  })).sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime());
}

function phaseBadge(phase) {
  const groupMatch = phase.match(/^Groupe ([A-L])$/);
  if (!groupMatch) return `<span class="phase-badge knockout">${escapeHtml(phase)}</span>`;
  return `<span class="phase-badge group-${groupMatch[1].toLowerCase()}">${escapeHtml(phase)}</span>`;
}

function teamSelect(attribute, selected) {
  return `
    <select ${attribute}>
      <option value="${escapeHtml(selected)}">${escapeHtml(selected)}</option>
      ${teams.map((team) => `<option value="${escapeHtml(team)}" ${selected === team ? "selected" : ""}>${escapeHtml(team)}</option>`).join("")}
    </select>
  `;
}

function knockoutDecisionControls(match, result, locked, prefix) {
  const visible = hasScore(result) && Number(result.homeScore) === Number(result.awayScore);
  return `
    <span class="knockout-decision ${visible ? "" : "hidden"}" data-decision="${prefix}-${match.id}">
      ${qualifiedSelect(match, result.qualifiedTeam, locked, `${prefix}-qualified`)}
      ${qualificationMethodSelect(match.id, result.qualificationMethod, locked, `${prefix}-method`)}
    </span>
  `;
}

function qualifiedSelect(match, selected, locked, dataAttr) {
  return `
    <select data-${dataAttr}="${match.id}" ${locked ? "disabled" : ""}>
      <option value="">Qualifié</option>
      <option value="${escapeHtml(match.home)}" ${selected === match.home ? "selected" : ""}>${escapeHtml(match.home)}</option>
      <option value="${escapeHtml(match.away)}" ${selected === match.away ? "selected" : ""}>${escapeHtml(match.away)}</option>
    </select>
  `;
}

function teamName(name) {
  const flagCode = flagCodes?.[name];
  if (!flagCode) return `<span>${escapeHtml(name)}</span>`;
  return `
    <span class="team-name">
      <img class="flag" src="https://flagcdn.com/w40/${flagCode}.png" srcset="https://flagcdn.com/w80/${flagCode}.png 2x" alt="">
      <span>${escapeHtml(name)}</span>
    </span>
  `;
}

function qualificationMethodSelect(matchId, selected = "regular", locked, dataAttr) {
  return `
    <select data-${dataAttr}="${matchId}" ${locked ? "disabled" : ""}>
      <option value="extra_time" ${selected === "extra_time" ? "selected" : ""}>Prolongation</option>
      <option value="penalties" ${selected === "penalties" ? "selected" : ""}>TAB</option>
    </select>
  `;
}

function readKnockoutDecision(match, score, prefix) {
  return getKnockoutDecision(match, {
    ...score,
    qualifiedTeam: document.querySelector(`[data-${prefix}-qualified="${match.id}"]`)?.value || "",
    qualificationMethod: document.querySelector(`[data-${prefix}-method="${match.id}"]`)?.value || "",
  });
}

function getKnockoutDecision(match, score) {
  if (match.stage !== "knockout" || !hasScore(score)) {
    return {
      qualifiedTeam: score.qualifiedTeam || "",
      qualificationMethod: score.qualificationMethod || "regular",
    };
  }

  const diff = Number(score.homeScore) - Number(score.awayScore);
  if (diff > 0) return { qualifiedTeam: match.home, qualificationMethod: "regular" };
  if (diff < 0) return { qualifiedTeam: match.away, qualificationMethod: "regular" };

  return {
    qualifiedTeam: score.qualifiedTeam || "",
    qualificationMethod: score.qualificationMethod || "extra_time",
  };
}

function handleScoreInput(event) {
  const homeMatchId = event.target.dataset.resultHome;
  const awayMatchId = event.target.dataset.resultAway;
  const matchId = homeMatchId || awayMatchId;
  if (!matchId) return;

  toggleDecisionControls(matchId, "result");
}

function handleClearResult(event) {
  const matchId = event.target.dataset.clearResult;
  if (!matchId) return;

  const homeInput = document.querySelector(`[data-result-home="${matchId}"]`);
  const awayInput = document.querySelector(`[data-result-away="${matchId}"]`);
  const qualifiedInput = document.querySelector(`[data-result-qualified="${matchId}"]`);
  const methodInput = document.querySelector(`[data-result-method="${matchId}"]`);

  if (homeInput) homeInput.value = "";
  if (awayInput) awayInput.value = "";
  if (qualifiedInput) qualifiedInput.value = "";
  if (methodInput) methodInput.value = "extra_time";

  delete state.results[matchId];
  toggleDecisionControls(matchId, "result");
  showToast("Résultat effacé. Clique sur Enregistrer pour confirmer.");
}

function toggleDecisionControls(matchId, prefix) {
  const homeScore = readNumber(`[data-${prefix}-home="${matchId}"]`);
  const awayScore = readNumber(`[data-${prefix}-away="${matchId}"]`);
  const controls = document.querySelector(`[data-decision="${prefix}-${matchId}"]`);
  if (!controls) return;

  const isDraw = homeScore !== "" && awayScore !== "" && Number(homeScore) === Number(awayScore);
  controls.classList.toggle("hidden", !isDraw);
}

function hasScore(item) {
  return item.homeScore !== "" && item.homeScore !== null && item.homeScore !== undefined && item.awayScore !== "" && item.awayScore !== null && item.awayScore !== undefined;
}

function readNumber(selector) {
  const value = document.querySelector(selector)?.value;
  return value === "" || value === undefined ? "" : Number(value);
}

function formatDate(dateString) {
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit" }).format(new Date(dateString));
}

function formatTime(dateString) {
  return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date(dateString));
}

function valueOrEmpty(value) {
  return value === undefined || value === null ? "" : value;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  window.setTimeout(() => toast.classList.remove("visible"), 1800);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function cssEscape(value) {
  if (window.CSS?.escape) return window.CSS.escape(value);
  return String(value).replaceAll('"', '\\"');
}
