export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Optional: allow Cloudflare Pages internals or specific paths
    // if (url.pathname.startsWith("/public/")) return env.ASSETS.fetch(request);

    const user = env.BASIC_AUTH_USER || "";
    const pass = env.BASIC_AUTH_PASS || "";
    if (!user || !pass) {
      return new Response("Auth not configured", { status: 500 });
    }

    const auth = request.headers.get("Authorization") || "";
    if (!isValidBasicAuth(auth, user, pass)) {
      return new Response("Unauthorized", {
        status: 401,
        headers: {
          "WWW-Authenticate": 'Basic realm="Restricted", charset="UTF-8"',
          "Cache-Control": "no-store",
        },
      });
    }

    // Serve static assets
    return env.ASSETS.fetch(request);
  }
};

function isValidBasicAuth(authHeader, expectedUser, expectedPass) {
  const [scheme, encoded] = authHeader.split(" ");
  if (!scheme || scheme.toLowerCase() !== "basic" || !encoded) return false;

  let decoded;
  try {
    decoded = atob(encoded);
  } catch {
    return false;
  }

  const idx = decoded.indexOf(":");
  if (idx < 0) return false;

  const u = decoded.slice(0, idx);
  const p = decoded.slice(idx + 1);

  return timingSafeEqual(u, expectedUser) && timingSafeEqual(p, expectedPass);
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}
