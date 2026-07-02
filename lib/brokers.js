import Parse from "./back4app";

const Broker = Parse.Object.extend("Broker");

function toPlain(obj) {
  return { ...obj.toJSON(), id: obj.id };
}

export function listenToBrokers(callback) {
  const query = new Parse.Query(Broker);
  query.descending("createdAt");
  query.find().then((results) => callback(results.map(toPlain)));
  return () => {};
}

export async function createBroker(data) {
  const broker = new Broker();
  Object.entries(data).forEach(([k, v]) => broker.set(k, v));
  return broker.save();
}

export async function deleteBroker(id) {
  const broker = new Broker();
  broker.id = id;
  return broker.destroy();
}
