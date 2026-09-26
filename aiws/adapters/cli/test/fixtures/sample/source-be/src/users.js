// In-memory user store (sample backend for AIWS tests).
const users = new Map([
  ['u1', { id: 'u1', name: 'An Nguyen' }],
  ['u2', { id: 'u2', name: 'Binh Tran' }],
]);

export function getUser(id) {
  const u = users.get(id);
  if (!u) {
    const err = new Error('USER_NOT_FOUND');
    err.status = 404;
    throw err;
  }
  return { ...u };
}
