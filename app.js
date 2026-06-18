const { tournamentStart, participants, externalParticipants = [], teams, matches, championProgress, flagCodes } = window.APP_DATA;
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
const overviewChampionSection = document.querySelector("#overviewChampionSection");
const overviewChampionPicks = document.querySelector("#overviewChampionPicks");
const overviewGroupBody = document.querySelector("#overviewGroupBody");
const overviewKnockoutBody = document.querySelector("#overviewKnockoutBody");
const resultsGroups = document.querySelector("#resultsGroups");
const resultsKnockoutBody = document.querySelector("#resultsKnockoutBody");
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

  document.querySelector("#savePredictions").addEventListener("click", savePredictionsFromForm);

  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((item) => item.classList.remove("active"));
      document.querySelectorAll(".view").forEach((view) => view.classList.remove("active-view"));
      tab.classList.add("active");
      document.querySelector(`#${tab.dataset.view}View`).classList.add("active-view");
      renderAll();
    });
  });
}

function renderAll() {
  renderProfileGate();
  renderPredictions();
  renderOverview();
  renderResults();
  renderLeaderboard();
}

function renderProfiles() {
  const sortedParticipants = [...participants].sort((a, b) =>
    a.localeCompare(b, "fr", { sensitivity: "base" })
  );
  const options = sortedParticipants
    .map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`)
    .join("");
  profileSelect.innerHTML = options;
  initialProfileSelect.innerHTML = options;
  if (!selectedParticipant) selectedParticipant = sortedParticipants[0];
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
          <div class="match-meta">
            <span class="meta-date">${formatDate(match.kickoff)}</span>
            <span class="meta-time">${formatTime(match.kickoff)}</span>
            <span class="meta-phase">${phaseBadge(match.phase)}</span>
          </div>
        </td>
        <td class="prediction-cell">
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
  renderOverviewChampionPicks();

  const rows = getConfiguredMatches()
    .map((match) => {
      const result = state.results[match.id] || {};
      const resultText = hasScore(result) ? `${result.homeScore}-${result.awayScore}` : "-";
      const picks = participants.map((participant) => renderParticipantPick(participant, match)).join("");
      const matchPredictions = participants
        .map((participant) => state.predictions[participant]?.matches?.[match.id])
        .filter((prediction) => hasScore(prediction || {}));
      const pickCount = matchPredictions.length;
      const averagePoints =
        hasScore(result) && pickCount > 0
          ? matchPredictions.reduce((total, prediction) => total + scoreMatch(match, prediction, result), 0) / pickCount
          : null;
      return {
        stage: match.stage,
        html: `
        <details class="overview-match">
          <summary class="overview-summary">
            <span class="om-date">${formatDate(match.kickoff)}<span class="om-time">${formatTime(match.kickoff)}</span></span>
            <span class="om-title">${teamName(match.home)} - ${teamName(match.away)}</span>
            <span class="om-result">${escapeHtml(resultText)}</span>
            ${averagePoints !== null ? `<span class="om-average" title="Moyenne des points gagnés par les pronostiqueurs">moy. ${formatAverage(averagePoints)} pts</span>` : ""}
            <span class="om-count">${pickCount} prono${pickCount > 1 ? "s" : ""}</span>
          </summary>
          <div class="prediction-grid">${picks || `<p class="om-empty">Aucun pronostic enregistré pour ce match.</p>`}</div>
        </details>
      `,
      };
    });

  overviewGroupBody.innerHTML = rows.filter((row) => row.stage === "group").map((row) => row.html).join("");
  overviewKnockoutBody.innerHTML = rows.filter((row) => row.stage === "knockout").map((row) => row.html).join("");
}

function renderOverviewChampionPicks() {
  const picks = participants
    .map((participant) => ({
      participant,
      champion: state.predictions[participant]?.champion || "",
    }))
    .filter((pick) => pick.champion)
    .sort((a, b) => a.participant.localeCompare(b.participant, "fr", { sensitivity: "base" }));

  overviewChampionSection.hidden = picks.length === 0;
  overviewChampionPicks.innerHTML = picks
    .map(
      (pick) => `
        <div class="champion-pick">
          <strong>${escapeHtml(pick.participant)}</strong>
          <span>${teamName(pick.champion)}</span>
        </div>
      `,
    )
    .join("");
}

function renderResults() {
  const configuredMatches = getConfiguredMatches();
  const groupMatches = configuredMatches.filter((match) => match.stage === "group");
  const knockoutMatches = configuredMatches.filter((match) => match.stage === "knockout");
  const phases = [...new Set(groupMatches.map((match) => match.phase))].sort((a, b) => a.localeCompare(b, "fr", { numeric: true }));

  resultsGroups.innerHTML = phases
    .map((phase) => renderResultsGroup(phase, groupMatches.filter((match) => match.phase === phase)))
    .join("");

  resultsKnockoutBody.innerHTML = knockoutMatches
    .map((match) => {
      const result = state.results[match.id] || {};
      const decision = getKnockoutDecision(match, result);
      const qualified = hasScore(result) && decision.qualifiedTeam ? `${teamName(decision.qualifiedTeam)}${decision.qualificationMethod !== "regular" ? ` <span class="match-meta inline-meta">(${methodLabel(decision.qualificationMethod)})</span>` : ""}` : "-";
      return `
        <tr>
          <td>${phaseBadge(match.phase)}</td>
          <td>${formatDate(match.kickoff)}<div class="match-meta">${formatTime(match.kickoff)}</div></td>
          <td><div class="match-title">${teamName(match.home)} - ${teamName(match.away)}</div></td>
          <td>${resultScore(result)}</td>
          <td>${qualified}</td>
        </tr>
      `;
    })
    .join("");
}

function renderResultsGroup(phase, phaseMatches) {
  const standings = computeGroupStandings(phaseMatches);
  const matchesRows = phaseMatches
    .map((match) => `
      <tr>
        <td>${formatDate(match.kickoff)}<div class="match-meta">${formatTime(match.kickoff)}</div></td>
        <td><div class="match-title">${teamName(match.home)} - ${teamName(match.away)}</div></td>
        <td>${resultScore(state.results[match.id] || {})}</td>
      </tr>
    `)
    .join("");
  const standingsRows = standings
    .map((team, index) => `
      <tr>
        <td class="rank">${index + 1}</td>
        <td class="leader-name">${teamName(team.name)}</td>
        <td>${team.played}</td>
        <td>${team.points}</td>
        <td>${team.goalDifference}</td>
        <td>${team.goalsFor}</td>
      </tr>
    `)
    .join("");

  return `
    <article class="results-group">
      <h3 class="phase-title">${escapeHtml(phase)}</h3>
      <div class="results-group-grid">
        <div class="table-wrap results-standing-wrap">
          <table class="matches-table standings-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Équipe</th>
                <th>J</th>
                <th>Pts</th>
                <th>Diff.</th>
                <th>BP</th>
              </tr>
            </thead>
            <tbody>${standingsRows}</tbody>
          </table>
        </div>
        <div class="table-wrap results-match-wrap">
          <table class="matches-table results-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Match</th>
                <th>Résultat</th>
              </tr>
            </thead>
            <tbody>${matchesRows}</tbody>
          </table>
        </div>
      </div>
    </article>
  `;
}

function renderLeaderboard() {
  const rows = participants
    .filter(hasParticipantPrediction)
    .map((participant) => ({
      participant,
      isExternal: externalParticipants.includes(participant),
      points: scoreParticipant(participant),
      championBonus: scoreChampion(state.predictions[participant]?.champion || ""),
      exactScores: countExactScores(participant),
    }))
    .sort((a, b) => b.points - a.points || b.exactScores - a.exactScores || a.participant.localeCompare(b.participant, "fr"));

  if (rows.length === 0) {
    leaderboard.innerHTML = `<p class="empty-state">Aucun participant n'a encore enregistré de pronostic.</p>`;
    return;
  }

  const pointValues = rows.map((row) => row.points);
  const minPoints = Math.min(...pointValues);
  const maxPoints = Math.max(...pointValues);
  let currentRank = 0;
  let previousRankedParticipant = null;
  const body = rows
    .map((row) => {
      const isTiedWithPrevious =
        !row.isExternal &&
        previousRankedParticipant &&
        previousRankedParticipant.points === row.points &&
        previousRankedParticipant.exactScores === row.exactScores;

      if (!row.isExternal && !isTiedWithPrevious) currentRank += 1;
      if (!row.isExternal) previousRankedParticipant = row;

      const displayedRank = row.isExternal ? "EXT." : isTiedWithPrevious ? "-" : currentRank;

      return `
        <tr class="${row.isExternal ? "external-participant" : ""}">
          <td class="rank">${displayedRank}</td>
          <td class="leader-name">${escapeHtml(row.participant)}${row.isExternal ? ` <span class="external-label">Externe</span>` : ""}</td>
          <td class="num-col leader-points ${leaderboardPointsClass(row.points, minPoints, maxPoints)}">${row.points}</td>
          <td class="num-col">${row.championBonus}</td>
          <td class="num-col">${row.exactScores}</td>
        </tr>
      `;
    })
    .join("");

  leaderboard.innerHTML = `
    <div class="table-wrap leaderboard-wrap">
      <table class="matches-table leaderboard-table">
        <thead>
          <tr>
            <th>Rang</th>
            <th>Participant</th>
            <th class="num-col">Points</th>
            <th class="num-col">Bonus vainqueur</th>
            <th class="num-col">Scores exacts</th>
          </tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    </div>
  `;
}

function hasParticipantPrediction(participant) {
  const prediction = state.predictions[participant];
  if (!prediction) return false;
  if (prediction.champion) return true;
  return Object.values(prediction.matches || {}).some((matchPrediction) => hasScore(matchPrediction));
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
  const prediction = buildPredictionFromForm(participant);

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

function buildPredictionFromForm(participant) {
  const prediction = structuredClone(getParticipantPrediction(participant));

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

  state.predictions[participant] = prediction;
  return prediction;
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

function countExactScores(participant) {
  const prediction = getParticipantPrediction(participant);
  return getConfiguredMatches().reduce((total, match) => {
    return total + (isExactScore(prediction.matches?.[match.id] || {}, state.results[match.id] || {}) ? 1 : 0);
  }, 0);
}

function computeGroupStandings(phaseMatches) {
  const teamsMap = new Map();
  phaseMatches.forEach((match) => {
    ensureStandingTeam(teamsMap, match.home);
    ensureStandingTeam(teamsMap, match.away);

    const result = state.results[match.id] || {};
    if (!hasScore(result)) return;

    applyGroupResult(teamsMap.get(match.home), Number(result.homeScore), Number(result.awayScore));
    applyGroupResult(teamsMap.get(match.away), Number(result.awayScore), Number(result.homeScore));
  });

  return rankGroupStandings([...teamsMap.values()], phaseMatches);
}

function ensureStandingTeam(teamsMap, team) {
  if (teamsMap.has(team)) return;
  teamsMap.set(team, {
    name: team,
    played: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    points: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
    fairPlay: 0,
  });
}

function applyGroupResult(team, goalsFor, goalsAgainst) {
  team.played += 1;
  team.goalsFor += goalsFor;
  team.goalsAgainst += goalsAgainst;
  team.goalDifference = team.goalsFor - team.goalsAgainst;

  if (goalsFor > goalsAgainst) {
    team.wins += 1;
    team.points += 3;
  } else if (goalsFor === goalsAgainst) {
    team.draws += 1;
    team.points += 1;
  } else {
    team.losses += 1;
  }
}

function rankGroupStandings(standings, phaseMatches) {
  const byPoints = new Map();
  standings.forEach((team) => {
    if (!byPoints.has(team.points)) byPoints.set(team.points, []);
    byPoints.get(team.points).push(team);
  });

  return [...byPoints.entries()]
    .sort((a, b) => b[0] - a[0])
    .flatMap(([, tiedTeams]) => sortTiedTeams(tiedTeams, phaseMatches));
}

function sortTiedTeams(tiedTeams, phaseMatches) {
  if (tiedTeams.length === 1) return tiedTeams;

  const h2hStats = computeHeadToHeadStats(tiedTeams, phaseMatches);
  return tiedTeams.sort((a, b) => {
    const h2hA = h2hStats.get(a.name);
    const h2hB = h2hStats.get(b.name);
    return (
      h2hB.points - h2hA.points ||
      h2hB.goalDifference - h2hA.goalDifference ||
      h2hB.goalsFor - h2hA.goalsFor ||
      b.goalDifference - a.goalDifference ||
      b.goalsFor - a.goalsFor ||
      b.fairPlay - a.fairPlay ||
      a.name.localeCompare(b.name, "fr", { sensitivity: "base" })
    );
  });
}

function computeHeadToHeadStats(tiedTeams, phaseMatches) {
  const tiedNames = new Set(tiedTeams.map((team) => team.name));
  const stats = new Map(tiedTeams.map((team) => [team.name, { points: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0 }]));

  phaseMatches.forEach((match) => {
    if (!tiedNames.has(match.home) || !tiedNames.has(match.away)) return;
    const result = state.results[match.id] || {};
    if (!hasScore(result)) return;

    applyHeadToHeadResult(stats.get(match.home), Number(result.homeScore), Number(result.awayScore));
    applyHeadToHeadResult(stats.get(match.away), Number(result.awayScore), Number(result.homeScore));
  });

  stats.forEach((team) => {
    team.goalDifference = team.goalsFor - team.goalsAgainst;
  });
  return stats;
}

function applyHeadToHeadResult(team, goalsFor, goalsAgainst) {
  team.goalsFor += goalsFor;
  team.goalsAgainst += goalsAgainst;
  if (goalsFor > goalsAgainst) team.points += 3;
  if (goalsFor === goalsAgainst) team.points += 1;
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

  if (isExactScore(prediction, result)) {
    points = 3;
  } else if (sameOutcome(prediction, result)) {
    points = 1;
    // Le bonus d'écart de buts ne s'applique qu'aux matchs décisifs :
    // sur un nul, l'écart est toujours 0 et le point serait acquis d'office.
    const isDraw = Number(result.homeScore) === Number(result.awayScore);
    if (!isDraw && sameGoalDifference(prediction, result)) points += 1;
  }

  if (match.stage === "knockout" && resultDecision.qualifiedTeam && predictionDecision.qualifiedTeam === resultDecision.qualifiedTeam) {
    points += 2;
    if (["extra_time", "penalties"].includes(resultDecision.qualificationMethod) && predictionDecision.qualificationMethod === resultDecision.qualificationMethod) {
      points += 1;
    }
  }

  return points;
}

function isExactScore(prediction, result) {
  return hasScore(prediction) && hasScore(result) && Number(prediction.homeScore) === Number(result.homeScore) && Number(prediction.awayScore) === Number(result.awayScore);
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

function formatAverage(value) {
  return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value);
}

function valueOrEmpty(value) {
  return value === undefined || value === null ? "" : value;
}

function resultScore(result) {
  return hasScore(result) ? `${result.homeScore}-${result.awayScore}` : "-";
}

function pointsClass(points) {
  if (points >= 5) return "score-bonus-high";
  if (points === 4) return "score-bonus";
  if (points === 3) return "score-exact";
  if (points === 2) return "score-close";
  if (points === 1) return "score-good";
  return "score-miss";
}

function leaderboardPointsClass(points, minPoints, maxPoints) {
  if (points === 0) return "leader-score-0";
  if (minPoints === maxPoints) return "leader-score-7";

  const ratio = (points - minPoints) / (maxPoints - minPoints);
  return `leader-score-${Math.round(ratio * 7)}`;
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
