// DEMO-ONLY role check. Anyone who can reach the service can claim any role by sending
// headers. Keep Cloud Run private (no allUsers invoker) while this is in place.
//
//   x-demo-role: student | ta | faculty
//   x-demo-user: stu_017 | ta_02 | fac_01
//
// TODO(auth): replace with USF SSO through Google Identity Platform (SAML/OIDC). Verify the
// Identity Platform ID token (Authorization: Bearer ...) with firebase-admin or
// google-auth-library, and read the role and user id from custom claims set at provisioning,
// never from request headers. The MCP HTTP transport should use the same verifier.

export const ROLES = Object.freeze(['student', 'ta', 'faculty']);

export function readDemoIdentity(headers) {
  const role = String(headers['x-demo-role'] || '').toLowerCase();
  const user = String(headers['x-demo-user'] || '');
  if (!ROLES.includes(role) || !user) return null;
  return { role, user, demo: true };
}

export function demoAuth({ enabled = true } = {}) {
  return (req, res, next) => {
    if (!enabled) {
      return res.status(501).json({ error: 'auth_not_configured', message: 'Demo auth is off and SSO is not wired yet.' });
    }
    const who = readDemoIdentity(req.headers);
    if (!who) {
      return res.status(401).json({ error: 'unauthenticated', message: 'Send x-demo-role (student|ta|faculty) and x-demo-user headers. Demo only.' });
    }
    req.user = who;
    return next();
  };
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'forbidden', message: `This needs role ${roles.join(' or ')}.` });
    }
    return next();
  };
}

/** Students may only act on their own id; listed staff roles may act on anyone. */
export function selfOr(param, ...staffRoles) {
  return (req, res, next) => {
    const target = req.params[param];
    if (req.user.role === 'student' && req.user.user === target) return next();
    if (staffRoles.includes(req.user.role)) return next();
    return res.status(403).json({ error: 'forbidden', message: 'You can only see your own data.' });
  };
}
