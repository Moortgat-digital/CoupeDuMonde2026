const { tournamentStart, participants, teams, matches, championProgress, flagCodes } = window.APP_DATA;
const profileStorageKey = "cdm2026-selected-profile";

const defaultState = {
  predictions: {},
  results: {},
  teamProgress: {},
  matchOverrides: {},
};

let state = structuredClone(defaultState);
let selectedParticipant = localStorage.getItem(profileStorageKey) || "";
let profileConfirmed = false;

const profileSelect = document.querySelector("#profileSelect");
const initialProfileSelect = document.querySelector("#initialProfileSelect");
const profileGate = document.querySelector("#profileGate");
const championPick = document.querySelector("#championPick");
const championLock = document.querySelector("#championLock");
const lockHint = document.querySelector("#lockHint");
const groupMatchesBody = document.querySelector("#groupMatchesBody");
const knockoutMatchesBody = document.querySelector("#knockoutMatchesBody");
const overviewGroupBody = document.querySelector("#overviewGroupBody");
const overviewKnockoutBody = document.querySelector("#overviewKnockoutBody");
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
  profileSelect.addEventListener("change", () => setSelectedParticipant(profileSelect.value));
  document.addEventListener("input", handleScoreInput);

  document.querySelector("#confirmProfile").addEventListener("click", () => {
    setSelectedParticipant(initialProfileSelect.value);
    profileConfirmed = true;
    profileGate.classList.remove("visible");
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
  renderProfileGate();
  renderPredictions();
  renderOverview();
  renderLeaderboard();
}

function renderProfiles() {
  const options = participants
    .map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`)
    .join("");
  profileSelect.innerHTML = options;
  initialProfileSelect.innerHTML = options;
  if (!selectedParticipant) selectedParticipant = participants[0];
  profileSelect.value = selectedParticipant;
  initialProfileSelect.value = selectedParticipant;
}

function renderChampionOptions() {
  championPick.innerHTML = [
    `<option value="">À choisir</option>`,
    ...teams.map((team) => `<option value="${escapeHtml(team)}">${escapeHtml(team)}</option>`),
  ].join("");
}

function renderProfileGate() {
  if (!profileConfirmed) {
    profileGate.classList.add("visible");
  }
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

  const rows = getConfiguredMatches().map(renderPredictionRow);
  groupMatchesBody.innerHTML = rows.filter((row) => row.stage === "group").map((row) => row.html).join("");
  knockoutMatchesBody.innerHTML = rows.filter((row) => row.stage === "knockout").map((row) => row.html).join("");
}

function renderPredictionRow(match) {
  const prediction = getParticipantPrediction(selectedParticipant);
  const matchPrediction = prediction.matches?.[match.id] || {};
  const result = state.results[match.id] || {};
  const locked = isPast(match.kickoff);
  const points = scoreMatch(match, matchPrediction, result);
  const resultText = hasScore(result) ? `${result.homeScore}-${result.awayScore}` : "-";

  return {
    stage: match.stage,
    html: `
      <tr>
        <td>${phaseBadge(match.phase)}</td>
        <td>${formatDate(match.kickoff)}</td>
        <td>
          <div class="match-title">${teamName(match.home)} - ${teamName(match.away)}</div>
          <div class="match-meta">${formatTime(match.kickoff)}</div>
        </td>
        <td>
          <div class="score-inputs">
            <input type="number" min="0" max="30" data-pred-home="${match.id}" value="${valueOrEmpty(matchPrediction.homeScore)}" ${locked ? "disabled" : ""}>
            <span>-</span>
            <input type="number" min="0" max="30" data-pred-away="${match.id}" value="${valueOrEmpty(matchPrediction.awayScore)}" ${locked ? "disabled" : ""}>
            ${match.stage === "knockout" ? knockoutDecisionControls(match, matchPrediction, locked, "pred") : ""}
          </div>
          ${locked ? `<div class="locked">Verrouillé</div>` : ""}
        </td>
        <td>${escapeHtml(resultText)}</td>
        <td><span class="points ${pointsClass(points)}">${points}</span></td>
      </tr>
    `,
  };
}

function renderOverview() {
  const rows = getConfiguredMatches()
    .map((match) => {
      const result = state.results[match.id] || {};
      const resultText = hasScore(result) ? `${result.homeScore}-${result.awayScore}` : "-";
      return {
        stage: match.stage,
        html: `
        <tr>
          <td>${formatDate(match.kickoff)}<div class="match-meta">${formatTime(match.kickoff)}</div></td>
          <td>
            <div class="match-title">${teamName(match.home)} - ${teamName(match.away)}</div>
          </td>
          <td>${escapeHtml(resultText)}</td>
          <td><div class="prediction-grid">${participants.map((participant) => renderParticipantPick(participant, match)).join("")}</div></td>
        </tr>
      `,
      };
    });

  overviewGroupBody.innerHTML = rows.filter((row) => row.stage === "group").map((row) => row.html).join("");
  overviewKnockoutBody.innerHTML = rows.filter((row) => row.stage === "knockout").map((row) => row.html).join("");
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

function renderParticipantPick(participant, match) {
  const prediction = state.predictions[participant]?.matches?.[match.id];
  if (!hasScore(prediction || {})) return "";

  const score = hasScore(prediction || {}) ? `${prediction.homeScore}-${prediction.awayScore}` : "-";
  const result = state.results[match.id] || {};
  const points = scoreMatch(match, prediction, result);
  const decision = match.stage === "knockout" && prediction ? getKnockoutDecision(match, prediction) : null;
  const qualified = decision?.qualifiedTeam ? `, ${decision.qualifiedTeam}${decision.qualificationMethod !== "regular" ? ` (${methodLabel(decision.qualificationMethod)})` : ""}` : "";
  return `
    <div class="prediction-chip">
      <strong>${escapeHtml(participant)}</strong>
      <span>${escapeHtml(score)}${escapeHtml(qualified)}</span>
      ${hasScore(result) ? `<em class="point-badge ${pointsClass(points)}">${points}</em>` : ""}
    </div>
  `;
}

function setSelectedParticipant(participant) {
  selectedParticipant = participant;
  profileConfirmed = true;
  localStorage.setItem(profileStorageKey, selectedParticipant);
  profileSelect.value = selectedParticipant;
  initialProfileSelect.value = selectedParticipant;
  renderAll();
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

    const matchPrediction = {
      homeScore: readNumber(`[data-pred-home="${match.id}"]`),
      awayScore: readNumber(`[data-pred-away="${match.id}"]`),
    };

    if (match.stage === "knockout") {
      Object.assign(matchPrediction, readKnockoutDecision(match, matchPrediction, "pred"));
    }

    prediction.matches[match.id] = matchPrediction;
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
  const predictionDecision = getKnockoutDecision(match, prediction);
  const resultDecision = getKnockoutDecision(match, result);

  let points = 0;

  if (Number(prediction.homeScore) === Number(result.homeScore) && Number(prediction.awayScore) === Number(result.awayScore)) {
    points = 3;
  } else if (sameOutcome(prediction, result)) {
    points = 1;
    if (sameGoalDifference(prediction, result)) points += 1;
  }

  if (match.stage === "knockout" && resultDecision.qualifiedTeam && predictionDecision.qualifiedTeam === resultDecision.qualifiedTeam) {
    points += 2;
    if (["extra_time", "penalties"].includes(resultDecision.qualificationMethod) && predictionDecision.qualificationMethod === resultDecision.qualificationMethod) {
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

function knockoutDecisionControls(match, prediction, locked, prefix) {
  const visible = hasScore(prediction) && Number(prediction.homeScore) === Number(prediction.awayScore);
  return `
    <span class="knockout-decision ${visible ? "" : "hidden"}" data-decision="${prefix}-${match.id}">
      ${qualifiedSelect(match, prediction.qualifiedTeam, locked, `${prefix}-qualified`)}
      ${qualificationMethodSelect(match.id, prediction.qualificationMethod, locked, `${prefix}-method`)}
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
  const decision = getKnockoutDecision(match, {
    ...score,
    qualifiedTeam: document.querySelector(`[data-${prefix}-qualified="${match.id}"]`)?.value || "",
    qualificationMethod: document.querySelector(`[data-${prefix}-method="${match.id}"]`)?.value || "",
  });

  return decision;
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
  const homeMatchId = event.target.dataset.predHome;
  const awayMatchId = event.target.dataset.predAway;
  const matchId = homeMatchId || awayMatchId;
  if (!matchId) return;

  toggleDecisionControls(matchId, "pred");
}

function toggleDecisionControls(matchId, prefix) {
  const homeScore = readNumber(`[data-${prefix}-home="${matchId}"]`);
  const awayScore = readNumber(`[data-${prefix}-away="${matchId}"]`);
  const controls = document.querySelector(`[data-decision="${prefix}-${matchId}"]`);
  if (!controls) return;

  const isDraw = homeScore !== "" && awayScore !== "" && Number(homeScore) === Number(awayScore);
  controls.classList.toggle("hidden", !isDraw);
}

function methodLabel(method) {
  if (method === "extra_time") return "prol.";
  if (method === "penalties") return "TAB";
  return "90 min";
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
