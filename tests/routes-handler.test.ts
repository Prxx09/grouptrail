import test from 'node:test';
import assert from 'node:assert/strict';

let handler: (req: Request) => Promise<Response>;
let env: Record<string, string> = {};
// Exercise the actual Edge Function with mocked runtime and network, no real keys.
(globalThis as any).Deno = {
  env: { get: (key: string) => env[key] },
  serve: (callback: typeof handler) => { handler = callback; },
};
await import('../supabase/functions/routes/index.ts');
const realFetch = globalThis.fetch;
const valid = { origin: [72.8777, 19.076], destination: [72.88, 19.08], profile: 'foot-walking' };

test('routing endpoint authorization, validation and quota gates', async t => {
  for (const scenario of [
    { name: 'missing bearer', token: false, status: 401, calls: 0 },
    { name: 'invalid session', authStatus: 401, status: 401, calls: 1 },
    { name: 'uninvited user', allowed: '', status: 403, calls: 1 },
    { name: 'disabled by default', enabled: '', status: 503, calls: 1 },
    { name: 'missing provider key', key: '', status: 503, calls: 1 },
    { name: 'invalid route', body: { ...valid, profile: 'motorcycle' }, status: 400, calls: 1 },
    { name: 'unavailable budget', budgetStatus: 500, status: 503, calls: 2 },
    { name: 'exhausted budget', budget: false, status: 429, calls: 2 },
    { name: 'provider quota', upstreamStatus: 429, status: 429, calls: 3 },
    { name: 'successful approved request', status: 200, calls: 3 },
  ]) {
    await t.test(scenario.name, async () => {
      env = {
        SUPABASE_URL: 'https://project.example', SUPABASE_ANON_KEY: 'test-public',
        SUPABASE_SERVICE_ROLE_KEY: 'test-server', BETA_USER_IDS: scenario.allowed ?? 'tester',
        ROUTING_ENABLED: scenario.enabled ?? 'true', ORS_API_KEY: scenario.key ?? 'test-ors',
      };
      const calls: string[] = [];
      globalThis.fetch = async (input, init) => {
        const url = String(input); calls.push(url);
        if (url.endsWith('/auth/v1/user')) return Response.json({ id: 'tester' }, { status: scenario.authStatus ?? 200 });
        if (url.endsWith('/rpc/consume_route_budget')) {
          assert.deepEqual(JSON.parse(init!.body as string), { p_user_id: 'tester' });
          return Response.json(scenario.budget ?? true, { status: scenario.budgetStatus ?? 200 });
        }
        assert.equal(url, 'https://api.heigit.org/openrouteservice/v2/directions/foot-walking/geojson');
        assert.equal((init!.headers as Record<string, string>).Authorization, 'test-ors');
        return Response.json({ features: [] }, { status: scenario.upstreamStatus ?? 200 });
      };
      try {
        const response = await handler(new Request('https://project.example/functions/v1/routes', {
          method: 'POST', headers: scenario.token === false ? {} : { Authorization: 'Bearer test-jwt' },
          body: JSON.stringify(scenario.body ?? valid),
        }));
        assert.equal(response.status, scenario.status);
        assert.equal(calls.length, scenario.calls);
        assert.equal(response.headers.get('cache-control'), 'no-store');
      } finally { globalThis.fetch = realFetch; }
    });
  }
});
