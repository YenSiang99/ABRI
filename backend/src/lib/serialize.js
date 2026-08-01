// Never send passwordHash to the client — every route that returns an
// account should go through this rather than spreading the raw row.
function serializeAccount(account) {
  const { passwordHash, ...safe } = account;
  return safe;
}

export { serializeAccount };
