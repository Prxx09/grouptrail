import { validateRouteRequest } from '../../../shared/routing.ts';

const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
const reply = (status: number, error: string) => new Response(JSON.stringify({ error }), { status, headers });

// Closed-beta endpoint. Requires the routing_budget migration before enabling.
// The default is fail-closed: no ORS request can occur by accidentally deploying this file.
Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return reply(405, 'POST required');
  const token = req.headers.get('Authorization');
  if (!token?.startsWith('Bearer ')) return reply(401, 'Sign in required');
  try {
    const projectUrl = Deno.env.get('SUPABASE_URL');
    const authKey = Deno.env.get('SUPABASE_ANON_KEY');
    if (!projectUrl || !authKey) return reply(503, 'Authentication not configured');
    const auth = await fetch(`${projectUrl}/auth/v1/user`, {
      headers: { Authorization: token, apikey: authKey },
      signal: AbortSignal.timeout(8000),
    });
    if (!auth.ok) return reply(401, 'Session expired; sign in again');
    const user = await auth.json();
    const allowed = (Deno.env.get('BETA_USER_IDS') ?? '').split(',').map(s => s.trim()).filter(Boolean);
    if (!allowed.includes(user.id)) return reply(403, 'Routing is restricted to invited testers');
    if (Deno.env.get('ROUTING_ENABLED') !== 'true') return reply(503, 'Routing is not enabled yet');
    const key = Deno.env.get('ORS_API_KEY');
    if (!key) return reply(503, 'Routing provider not configured');
    if (Number(req.headers.get('content-length') ?? 0) > 2048) return reply(413, 'Request too large');
    const body = await req.text();
    if (body.length > 2048) return reply(413, 'Request too large');
    let route;
    try { route = validateRouteRequest(JSON.parse(body)); }
    catch { return reply(400, 'Invalid route: supported mode and coordinates 10 m to 100 km apart required'); }
    const serverKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!serverKey) return reply(503, 'Route budget unavailable');
    const budget = await fetch(`${projectUrl}/rest/v1/rpc/consume_route_budget`, {
      method: 'POST',
      headers: { apikey: serverKey, Authorization: `Bearer ${serverKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_user_id: user.id }), signal: AbortSignal.timeout(5000),
    });
    if (!budget.ok) return reply(503, 'Route budget unavailable');
    if (await budget.json() !== true) return reply(429, 'Beta route limit reached; try later');
    const upstream = await fetch(`https://api.openrouteservice.org/v2/directions/${route.profile}/geojson`, {
      method: 'POST',
      headers: { Authorization: key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ coordinates: [route.origin, route.destination], instructions: true }),
      signal: AbortSignal.timeout(15000),
    });
    if (upstream.status === 429) return reply(429, 'Free routing quota reached; try later');
    if (!upstream.ok) return reply(502, 'Routing provider could not find a route');
    return new Response(await upstream.text(), { headers });
  } catch {
    // Do not log coordinates, authorization headers or provider response bodies.
    return reply(503, 'Routing temporarily unavailable');
  }
});
