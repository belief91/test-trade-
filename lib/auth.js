import Parse from "./back4app";

/**
 * Parse n'a pas d'écouteur temps réel sur l'état de connexion (contrairement
 * à Firebase Auth). On lit donc la session une seule fois — login() et
 * logout() forcent un rechargement de page pour que cet état soit relu proprement.
 */
export function listenToAuth(callback) {
  callback(Parse.User.current());
  return () => {};
}

export async function login(email, password) {
  const user = await Parse.User.logIn(email, password);
  if (typeof window !== "undefined") window.location.reload();
  return user;
}

export async function logout() {
  await Parse.User.logOut();
  if (typeof window !== "undefined") window.location.reload();
}
