function roundToTen(value) {
  return Math.round(value / 10) * 10;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function accuracy(total, wrong) {
  total = Number(total || 0);
  wrong = Number(wrong || 0);

  if (total <= 0) return 100;

  return Math.max(0, ((total - wrong) / total) * 100);
}

function getActivityBonus(punishments7d) {
  const n = Number(punishments7d || 0);

  if (n <= 0) return 0;
  if (n <= 5) return 10;
  if (n <= 10) return 20;
  if (n <= 20) return 40;
  if (n <= 35) return 60;
  return 80;
}

function getQualityLimit(punishments7d) {
  const n = Number(punishments7d || 0);

  if (n <= 0) return 0;
  if (n <= 5) return 30;
  if (n <= 10) return 60;
  if (n <= 20) return 90;
  return 120;
}

function getQualityBonus(punishments7d, wrong7d) {
  const limit = getQualityLimit(punishments7d);
  const acc = accuracy(punishments7d, wrong7d);

  if (acc >= 98) return limit;
  if (acc >= 95) return limit * 0.8;
  if (acc >= 90) return limit * 0.6;
  if (acc >= 80) return limit * 0.3;
  return 0;
}

function getProofBonus(punishments7d, withProofs7d) {
  const total = Number(punishments7d || 0);
  const withProofs = Number(withProofs7d || 0);

  if (total <= 0) return 0;

  const maxBonus = total < 5 ? 30 : 80;
  const percent = (withProofs / total) * 100;

  if (percent >= 95) return maxBonus;
  if (percent >= 80) return Math.min(maxBonus, 60);
  if (percent >= 60) return Math.min(maxBonus, 30);
  return 0;
}

function getEventBonus(events7d) {
  const n = Number(events7d || 0);

  if (n <= 0) return 0;
  if (n === 1) return 30;
  if (n === 2) return 60;
  return 100;
}

function getWrongPenalty(wrong7d) {
  const n = Number(wrong7d || 0);

  if (n <= 0) return 0;
  if (n === 1) return 40;
  if (n === 2) return 80;
  return 120;
}

function getRemovedPenalty(removed7d) {
  const n = Number(removed7d || 0);

  if (n <= 0) return 0;
  if (n === 1) return 20;
  if (n === 2) return 40;
  return 60;
}

function getMissingProofPenalty(withoutProofs7d) {
  const n = Number(withoutProofs7d || 0);

  if (n <= 0) return 0;
  if (n <= 2) return 20;
  if (n <= 5) return 40;
  return 60;
}

function calculateWeeklyReward(stats) {
  const base = 100;

  const punishments7d = Number(stats?.punishments_7d || 0);
  const wrong7d = Number(stats?.wrong_7d || 0);
  const removed7d = Number(stats?.removed_7d || 0);
  const events7d = Number(stats?.events_7d || 0);

  const withProofs7d = Number(stats?.with_proofs_7d || stats?.with_proofs || 0);
  const withoutProofs7d = Number(stats?.without_proofs_7d || stats?.without_proofs || 0);

  const activityBonus = getActivityBonus(punishments7d);
  const qualityBonus = getQualityBonus(punishments7d, wrong7d);
  const proofBonus = getProofBonus(punishments7d, withProofs7d);
  const eventBonus = getEventBonus(events7d);

  const wrongPenalty = getWrongPenalty(wrong7d);
  const removedPenalty = getRemovedPenalty(removed7d);
  const missingProofPenalty = getMissingProofPenalty(withoutProofs7d);

  const raw =
    base +
    activityBonus +
    qualityBonus +
    proofBonus +
    eventBonus -
    wrongPenalty -
    removedPenalty -
    missingProofPenalty;

  const finalReward = clamp(roundToTen(raw), 100, 500);

  return {
    finalReward,

    base,
    activityBonus: roundToTen(activityBonus),
    qualityBonus: roundToTen(qualityBonus),
    proofBonus: roundToTen(proofBonus),
    eventBonus: roundToTen(eventBonus),

    wrongPenalty,
    removedPenalty,
    missingProofPenalty,

    accuracy7d: Number(accuracy(punishments7d, wrong7d).toFixed(2)),
  };
}

module.exports = {
  calculateWeeklyReward,
};