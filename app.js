const { tournamentStart, participants, teams, matches, championProgress } = window.APP_DATA;
const profileStorageKey = "cdm2026-selected-profile";

const defaultState = {
  predictions: {},
  results: {},
  teamProgress: {},
  matchOverrides: {},
};

let state = structuredClone(defaultState);
let selectedParticipant = localStorage.getItem(profileStorageKey) || participants[0];

const profileSelect = document.querySelector("#profileSelect");
const championPick = document.querySelector("#championPick");
const championLock = document.querySelector("#championLock");
const lockHint = document.querySelector("#lockHint");
const matchesBody = document.querySelector("#matchesBody");
const leaderboard = document.querySelector("#leaderboard");
const toast = document.querySelector("#toast");

init();

async function init() {
  renderProfiles();
  renderChampionOptions();
  await loadRemoteState();
  renderAll();
  bindEvents();
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

function bindEvents() {
  profileSelect.addEventListener("change", () => {
    selectedParticipant = profileSelect.value;
    localStorage.setItem(profileStorageKey, selectedParticipant);
    renderAll();
  });

  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((item) => item.classList.remove("active"));
      document.querySelectorAll(".view").forEach((view) => view.classList.remove("active-view"));
      tab.classList.add("active");
      document.querySelector(`#${tab.dataset.view}View`).classList.add("active-view");
      renderAll();
    });
  });

  document.querySelector("#savePredictions").addEventListener("click", savePredictionsFromForm);
}

function renderAll() {
  renderPredictions();
  renderLeaderboard();
}

function renderProfiles() {
  profileSelect.innerHTML = participants
    .map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`)
    .join("");
  profileSelect.value = selectedParticipant;
}

function renderChampionOptions() {
  championPick.innerHTML = [
    `<option value="">À choisir</option>`,
    ...teams.map((team) => `<option value="${escapeHtml(team)}">${escapeHtml(team)}</option>`),
  ].join("");
}

function renderPredictions() {
  const participant = selectedParticipant;
  const prediction = getParticipantPrediction(participant);
  const championLocked = isPast(tournamentStart);

  championPick.value = prediction.champion || "";
  championPick.disabled = championLocked;
  championLock.textContent = championLocked ? "Verrouillé" : "Modifiable";
  lockHint.textContent =
    "Un score reste modifiable jusqu'au coup d'envoi du match. Le vainqueur final est modifiable jusqu'au lancement du tournoi.";

  matchesBody.innerHTML = getConfiguredMatches()
    .map((match) => {
      const matchPrediction = prediction.matches?.[match.id] || {};
      const result = state.results[match.id] || {};
      const locked = isPast(match.kickoff);
      const points = scoreMatch(match, matchPrediction, result);
      const resultText = hasScore(result) ? `${result.homeScore}-${result.awayScore}` : "-";

      return `
        <tr>
          <td>${escapeHtml(match.phase)}</td>
          <td>${formatDate(match.kickoff)}</td>
          <td>
            <div class="match-title">${escapeHtml(match.home)} - ${escapeHtml(match.away)}</div>
            <div class="match-meta">${formatTime(match.kickoff)}</div>
          </td>
          <td>
            <div class="score-inputs">
              <input type="number" min="0" max="30" data-pred-home="${match.id}" value="${valueOrEmpty(matchPrediction.homeScore)}" ${locked ? "disabled" : ""}>
              <span>-</span>
              <input type="number" min="0" max="30" data-pred-away="${match.id}" value="${valueOrEmpty(matchPrediction.awayScore)}" ${locked ? "disabled" : ""}>
              ${match.stage === "knockout" ? qualifiedSelect(match, matchPrediction.qualifiedTeam, locked, "pred-qualified") : ""}
              ${match.stage === "knockout" ? qualificationMethodSelect(match.id, matchPrediction.qualificationMethod, locked, "pred-method") : ""}
            </div>
            ${locked ? `<div class="locked">Verrouillé</div>` : ""}
          </td>
          <td>${escapeHtml(resultText)}</td>
          <td><span class="points ${pointsClass(points)}">${points}</span></td>
        </tr>
      `;
    })
    .join("");
}

function renderLeaderboard() {
  const rows = participants
    .map((participant) => ({
      participant,
      points: scoreParticipant(participant),
    }))
    .sort((a, b) => b.points - a.points || a.participant.localeCompare(b.participant, "fr"));

  leaderboard.innerHTML = rows
    .map(
      (row, index) => `
      <div class="leader-row">
        <div class="rank">${index + 1}</div>
        <div class="leader-name">${escapeHtml(row.participant)}</div>
        <div class="leader-points">${row.points}</div>
      </div>
    `,
    )
    .join("");
}

async function savePredictionsFromForm() {
  const participant = selectedParticipant;
  const prediction = getParticipantPrediction(participant);

  if (!isPast(tournamentStart)) {
    prediction.champion = championPick.value;
  }

  prediction.matches = prediction.matches || {};
  getConfiguredMatches().forEach((match) => {
    if (isPast(match.kickoff)) return;

    prediction.matches[match.id] = {
      homeScore: readNumber(`[data-pred-home="${match.id}"]`),
      awayScore: readNumber(`[data-pred-away="${match.id}"]`),
      qualifiedTeam: document.querySelector(`[data-pred-qualified="${match.id}"]`)?.value || "",
      qualificationMethod: document.querySelector(`[data-pred-method="${match.id}"]`)?.value || "regular",
    };
  });

  try {
    const response = await fetch("/api/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "savePrediction",
        participant,
        prediction,
      }),
    });

    if (!response.ok) throw new Error("Erreur d'enregistrement");
    state = { ...structuredClone(defaultState), ...(await response.json()) };
    renderAll();
    showToast("Pronostics enregistrés");
  } catch {
    showToast("Enregistrement impossible");
  }
}

function getParticipantPrediction(participant) {
  if (!state.predictions[participant]) {
    state.predictions[participant] = { champion: "", matches: {} };
  }

  return state.predictions[participant];
}

function scoreParticipant(participant) {
  const prediction = getParticipantPrediction(participant);
  const matchPoints = getConfiguredMatches().reduce((total, match) => {
    return total + scoreMatch(match, prediction.matches?.[match.id] || {}, state.results[match.id] || {});
  }, 0);

  return matchPoints + scoreChampion(prediction.champion);
}

function scoreChampion(team) {
  if (!team) return 0;
  return championProgress[state.teamProgress[team] || "none"] || 0;
}

function scoreMatch(match, prediction, result) {
  if (!hasScore(prediction) || !hasScore(result)) return 0;

  let points = 0;

  if (Number(prediction.homeScore) === Number(result.homeScore) && Number(prediction.awayScore) === Number(result.awayScore)) {
    points = 3;
  } else if (sameOutcome(prediction, result)) {
    points = 1;
    if (sameGoalDifference(prediction, result)) points += 1;
  }

  if (match.stage === "knockout" && result.qualifiedTeam && prediction.qualifiedTeam === result.qualifiedTeam) {
    points += 2;
    if (["extra_time", "penalties"].includes(result.qualificationMethod) && prediction.qualificationMethod === result.qualificationMethod) {
      points += 1;
    }
  }

  return points;
}

function sameOutcome(a, b) {
  const predDiff = Number(a.homeScore) - Number(a.awayScore);
  const resultDiff = Number(b.homeScore) - Number(b.awayScore);
  return Math.sign(predDiff) === Math.sign(resultDiff);
}

function sameGoalDifference(a, b) {
  return Number(a.homeScore) - Number(a.awayScore) === Number(b.homeScore) - Number(b.awayScore);
}

function hasScore(item) {
  return item.homeScore !== "" && item.homeScore !== null && item.homeScore !== undefined && item.awayScore !== "" && item.awayScore !== null && item.awayScore !== undefined;
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

function qualificationMethodSelect(matchId, selected = "regular", locked, dataAttr) {
  return `
    <select data-${dataAttr}="${matchId}" ${locked ? "disabled" : ""}>
      <option value="regular" ${selected === "regular" ? "selected" : ""}>Temps réglementaire</option>
      <option value="extra_time" ${selected === "extra_time" ? "selected" : ""}>Prolongation</option>
      <option value="penalties" ${selected === "penalties" ? "selected" : ""}>TAB</option>
    </select>
  `;
}

function getConfiguredMatches() {
  return matches.map((match) => ({
    ...match,
    ...(state.matchOverrides?.[match.id] || {}),
  }));
}

function readNumber(selector) {
  const value = document.querySelector(selector)?.value;
  return value === "" || value === undefined ? "" : Number(value);
}

function isPast(dateString) {
  return Date.now() >= new Date(dateString).getTime();
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

function pointsClass(points) {
  if (points >= 3) return "exact";
  if (points > 0) return "good";
  return "";
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
