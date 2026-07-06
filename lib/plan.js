import Parse from "./back4app";

const Plan = Parse.Object.extend("Plan");

export function defaultPlan() {
  return { reglesGenerales: "", criteresEntree: "", gestionRisque: "", checklist: [] };
}

export async function getPlan() {
  const query = new Parse.Query(Plan);
  query.limit(1);
  const results = await query.find();
  if (results.length === 0) return defaultPlan();
  return { ...defaultPlan(), ...results[0].toJSON() };
}

export async function savePlan(plan) {
  const query = new Parse.Query(Plan);
  query.limit(1);
  const results = await query.find();
  const obj = results[0] || new Plan();
  Object.entries(plan).forEach(([k, v]) => obj.set(k, v));
  return obj.save();
}
