import Parse from "./back4app";

const WeeklyReview = Parse.Object.extend("WeeklyReview");

function pad2(n) {
  return String(n).padStart(2, "0");
}

export function weekStartId(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

async function findByWeekId(weekId) {
  const query = new Parse.Query(WeeklyReview);
  query.equalTo("weekId", weekId);
  const results = await query.find();
  return results[0] || null;
}

export async function getReview(weekId) {
  const obj = await findByWeekId(weekId);
  if (!obj) return { ceQuiAMarche: "", ceQuiNaPasMarche: "", ameliorations: "" };
  return obj.toJSON();
}

export async function saveReview(weekId, data) {
  let obj = await findByWeekId(weekId);
  if (!obj) {
    obj = new WeeklyReview();
    obj.set("weekId", weekId);
  }
  Object.entries(data).forEach(([k, v]) => obj.set(k, v));
  return obj.save();
}

export function listenToReviews(callback) {
  const query = new Parse.Query(WeeklyReview);
  query.descending("weekId");
  query.find().then((results) => {
    callback(results.map((r) => ({ ...r.toJSON(), id: r.get("weekId") })));
  });
  return () => {};
}
