export const MATCHING_WEIGHTS = Object.freeze({
  imageSim: 0.4,
  textSim: 0.3,
  categoryMatch: 0.1,
  locationSim: 0.1,
  dateScore: 0.1,
});

export const MATCH_THRESHOLD = Number(process.env.MATCH_THRESHOLD || 0.25);
export const CONTACT_VERIFICATION_THRESHOLD = Number(process.env.CONTACT_VERIFICATION_THRESHOLD || 0.6);
export const DATE_DECAY_DAYS = Math.max(1, Number(process.env.MATCH_DATE_DECAY_DAYS || 30));

export const CAMPUS_ZONES = (process.env.CAMPUS_ZONES || "")
  .split(";")
  .map((zone) => zone.split("|").map((location) => location.trim().toLowerCase()).filter(Boolean))
  .filter((zone) => zone.length > 1);
