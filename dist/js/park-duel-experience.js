import {
  ADAPTATION_OBSERVATIONS,
  buildOpponentScout,
  createAdaptiveDefense,
  deriveGameStateSignals,
  getFoulPreset,
} from "./basketball-intelligence.js";
import {
  createHighlightExportMetadata,
  createNcnBroadcastDirector,
  createPauseMenuContract,
  createReplayDirector,
  createSoundtrackDirector,
  prioritizeHighlights,
} from "./broadcast-presentation.js";

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, Number(value) || 0));
const freeze = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freeze);
  return Object.freeze(value);
};
const copy = (value) => JSON.parse(JSON.stringify(value));

export const PARK_DUEL_OPPONENT = freeze({
  id: "shade",
  name: "Shade",
  preferredScoringArea: "right_midrange",
  dominantHand: "left",
  archetype: "change_of_pace_creator",
  favoriteMove: "crossover",
  attributes: { shooting: 84, handles: 89, speed: 82, strength: 64 },
  defensiveRatings: { perimeterDefense: 78, discipline: 61, strength: 69 },
  recentGames: [{ won: true }, { won: true }, { won: false }, { won: true }, { won: false }],
});

function emptyTeamStats() {
  return {
    attempts: 0,
    makes: 0,
    points: 0,
    contestedAttempts: 0,
    contestedMakes: 0,
    paintPoints: 0,
    longMakes: 0,
    rebounds: 0,
    steals: 0,
    blocks: 0,
    turnovers: 0,
    defensiveStops: 0,
    releaseQualityTotal: 0,
  };
}

function advancedLine(team) {
  const attempts = Math.max(0, team.attempts);
  return freeze({
    ...team,
    fieldGoalPercent: attempts ? team.makes / attempts : 0,
    contestedPercent: team.contestedAttempts ? team.contestedMakes / team.contestedAttempts : 0,
    possessionEfficiency: attempts + team.turnovers ? team.points / (attempts + team.turnovers) : 0,
    averageReleaseTiming: attempts ? team.releaseQualityTotal / attempts : 0,
  });
}

export class ParkDuelExperience {
  constructor({ difficulty = "pro", seed = 100, now = () => Date.now() } = {}) {
    this.difficulty = difficulty;
    this.seed = seed;
    this.now = now;
    this.adaptiveDefense = createAdaptiveDefense({ difficulty, seed });
    this.broadcast = createNcnBroadcastDirector();
    this.soundtrack = createSoundtrackDirector({ venueId: "montgomery", streamSafe: true });
    this.replay = createReplayDirector({ frameRate: 30 });
    this.reset();
  }

  reset(config = {}) {
    const nextDifficulty = config.difficulty || this.difficulty;
    if (nextDifficulty !== this.difficulty) {
      this.difficulty = nextDifficulty;
      this.adaptiveDefense = createAdaptiveDefense({ difficulty: nextDifficulty, seed: this.seed });
    }
    this.matchId = String(config.matchId || `park-duel-${this.now()}`);
    this.startedAt = this.now();
    this.venueId = config.venueId || "montgomery";
    this.venueName = config.venueName || "Montgomery Fieldhouse";
    this.ball = config.ball || { id: "classic", name: "Classic Orange" };
    this.targetScore = Math.max(1, Math.round(config.targetScore || 11));
    this.rulePreset = getFoulPreset(config.rulePreset || "street");
    this.home = { id: "ace", name: config.homeName || "Ace", overall: Math.round(config.homeOverall || 72), record: config.homeRecord || "0-0" };
    this.away = { id: "shade", name: "Shade", record: "3-2" };
    this.score = { home: 0, away: 0 };
    this.stats = { home: emptyTeamStats(), away: emptyTeamStats() };
    this.events = [];
    this.possessionObservations = [];
    this.adaptiveDefense.reset();
    this.broadcast.reset();
    this.soundtrack.setVenue(this.venueId);
    this.soundtrack.setState("intro");
    this.replay.resetForWorldReplacement();
    return this.getSnapshot();
  }

  getIntro() {
    const scout = buildOpponentScout(PARK_DUEL_OPPONENT);
    return freeze({
      matchId: this.matchId,
      venue: { id: this.venueId, name: this.venueName },
      ball: copy(this.ball),
      home: copy(this.home),
      away: copy(this.away),
      targetScore: this.targetScore,
      winBy: 2,
      firstPossession: "NOVA ball / check at the top",
      rules: copy(this.rulePreset),
      scout,
      ncn: {
        venue: this.broadcast.announce("venue-open", { venueName: this.venueName, now: 0 }),
        scouting: this.broadcast.announce("scouting", { rivalName: this.away.name, report: PARK_DUEL_OPPONENT, now: 0 }),
      },
    });
  }

  record(type, event = {}) {
    const teamId = event.teamId === "away" || event.team === "away" ? "away" : "home";
    const otherTeam = teamId === "home" ? "away" : "home";
    const stat = this.stats[teamId];
    const normalizedType = String(type || "").toLowerCase();
    const at = Math.max(0, Number(event.timestamp) || (this.now() - this.startedAt) / 1000);
    if (normalizedType === "dribble" && event.move === "crossover" && teamId === "home") {
      this.possessionObservations.push({ type: ADAPTATION_OBSERVATIONS.CROSSOVER, success: event.success !== false });
    }
    if (normalizedType === "shot") {
      stat.attempts += 1;
      stat.releaseQualityTotal += clamp(event.releaseQuality ?? event.quality);
      if ((Number(event.coverage) || 0) >= 0.35) stat.contestedAttempts += 1;
      if (teamId === "home") {
        const observation = event.isThree
          ? (event.made ? ADAPTATION_OBSERVATIONS.THREE_MADE : ADAPTATION_OBSERVATIONS.THREE_MISSED)
          : ["layup", "dunk"].includes(event.context) ? ADAPTATION_OBSERVATIONS.DRIVE : null;
        if (observation) this.possessionObservations.push({ type: observation, success: event.made });
      }
    }
    if (normalizedType === "score") {
      const points = Math.max(1, Math.round(Number(event.points) || 1));
      stat.makes += 1;
      stat.points += points;
      this.score[teamId] += points;
      if ((Number(event.coverage) || 0) >= 0.35) stat.contestedMakes += 1;
      if (["layup", "dunk", "post"].includes(event.context)) stat.paintPoints += points;
      if (event.isLong || event.isThree) stat.longMakes += 1;
      const leadBefore = this.score[teamId] - points - this.score[otherTeam];
      let highlightType = event.context === "dunk" ? "dunk" : event.isLong ? "long-shot" : null;
      if (this.score[teamId] >= this.targetScore && this.score[teamId] - this.score[otherTeam] >= 2) highlightType = "game-winner";
      if (highlightType) this.events.push(freeze({ id: `${this.matchId}-${this.events.length + 1}`, type: highlightType, timestamp: at, duration: 4, value: points * 10 + Math.max(0, -leadBefore), playerId: event.playerId, teamId }));
      if (teamId === "home") this.completePossession();
    }
    if (normalizedType === "miss" && teamId === "home") this.completePossession();
    if (normalizedType === "rebound") stat.rebounds += 1;
    if (normalizedType === "steal") { stat.steals += 1; this.stats[otherTeam].turnovers += 1; }
    if (normalizedType === "block") {
      stat.blocks += 1;
      stat.defensiveStops += 1;
      this.events.push(freeze({ id: `${this.matchId}-${this.events.length + 1}`, type: "block", timestamp: at, duration: 3.5, value: 20, playerId: event.playerId, teamId }));
    }
    if (normalizedType === "turnover") this.stats[teamId].turnovers += 1;
    const signals = deriveGameStateSignals({
      homeScore: this.score.home,
      awayScore: this.score.away,
      targetScore: this.targetScore,
      recentScoringTeams: this.events.filter((item) => item.type === "score").slice(-4).map((item) => item.teamId),
    });
    if (signals.gamePoint) this.soundtrack.setState("game-point");
    return this.getSnapshot();
  }

  completePossession() {
    const plan = this.adaptiveDefense.observePossession(this.possessionObservations, { possessionId: this.events.length + 1 });
    this.possessionObservations = [];
    return plan;
  }

  getPauseContract(replayFrames = 0) {
    return createPauseMenuContract({
      replayFrames,
      restartAllowed: true,
      challenges: [{ id: "night-read", label: "Score after forcing a defensive adjustment", progress: Math.min(1, this.adaptiveDefense.getSnapshot().possession / 3) }],
      rules: { preset: this.rulePreset.label, targetScore: this.targetScore, winBy: 2 },
    });
  }

  getPostgame(outcome = "complete") {
    const reel = prioritizeHighlights(this.events, { maxClips: 5, maxDuration: 24 });
    this.soundtrack.setState(outcome === "win" ? "victory" : "postgame");
    return freeze({
      matchId: this.matchId,
      outcome,
      finalScore: copy(this.score),
      stats: { home: advancedLine(this.stats.home), away: advancedLine(this.stats.away) },
      reel,
      export: reel.clips[0] ? createHighlightExportMetadata({ matchId: this.matchId, replayId: `${this.matchId}-reel`, marker: reel.clips[0], venueId: this.venueId, mode: "park-duel", finalScore: this.score, participants: [this.home, this.away], createdAt: new Date(this.now()).toISOString() }) : null,
    });
  }

  getSnapshot() {
    return freeze({
      matchId: this.matchId,
      score: copy(this.score),
      stats: { home: advancedLine(this.stats.home), away: advancedLine(this.stats.away) },
      adaptation: this.adaptiveDefense.getPlan(),
      eventCount: this.events.length,
      soundtrack: this.soundtrack.getSnapshot(),
    });
  }
}

export function createParkDuelExperience(options) {
  return new ParkDuelExperience(options);
}
