// Behind Caddy, Host stays the browser's host and req.protocol uses the trusted proxy.
// This permits same-origin deployments without knowing the VPS address in advance.
const isOriginAllowed = (req, origin, allowedOrigins = [], allowSameOrigin = false) => {
  if (!origin || allowedOrigins.includes(origin)) return true;
  if (!allowSameOrigin) return false;
  try {
    const target = new URL(`${req.protocol}://${req.get('host')}`);
    return ['http:', 'https:'].includes(target.protocol)
      && new URL(origin).origin === origin
      && origin === target.origin;
  } catch {
    return false;
  }
};

module.exports = { isOriginAllowed };
