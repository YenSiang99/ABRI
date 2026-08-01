// Express doesn't catch rejected promises from async route handlers on its
// own — without this, a thrown/rejected error skips straight to Express's
// default HTML error page instead of our JSON error middleware. Wrap every
// async handler in this.
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export { asyncHandler };
