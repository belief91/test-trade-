import Parse from "./back4app";

const Goal = Parse.Object.extend("Goal");

function toPlain(obj) {
  return { ...obj.toJSON(), id: obj.id };
}

export function listenToGoals(callback) {
  const query = new Parse.Query(Goal);
  query.descending("createdAt");
  query.find().then((results) => callback(results.map(toPlain)));
  return () => {};
}

export async function createGoal(data) {
  const goal = new Goal();
  goal.set("title", data.title);
  goal.set("targetAmount", data.targetAmount);
  goal.set("currentAmount", 0);
  goal.set("priority", data.priority || "Medium");
  goal.set("profitAllocationPercentage", data.profitAllocationPercentage || 0);
  goal.set("status", "Active");
  return goal.save();
}

export async function deleteGoal(id) {
  const goal = new Goal();
  goal.id = id;
  return goal.destroy();
}

/**
 * Répartit un profit (en $) entre tous les objectifs actifs, selon leur
 * pourcentage d'allocation. Appelée automatiquement après un trade manuel gagnant.
 */
export async function allocateProfitToGoals(profitAmount) {
  if (!profitAmount || profitAmount <= 0) return;

  const query = new Parse.Query(Goal);
  query.equalTo("status", "Active");
  const goals = await query.find();

  const toSave = [];
  goals.forEach((goal) => {
    const pct = goal.get("profitAllocationPercentage") || 0;
    const allocation = (pct / 100) * profitAmount;
    if (allocation <= 0) return;

    const newAmount = (goal.get("currentAmount") || 0) + allocation;
    goal.set("currentAmount", newAmount);
    if (newAmount >= goal.get("targetAmount")) goal.set("status", "Completed");
    toSave.push(goal);
  });

  if (toSave.length) await Parse.Object.saveAll(toSave);
}
