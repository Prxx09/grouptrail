-- Defense in depth: direct client roles must never read or mutate quota counters.
create policy "deny direct client access"
on public.routing_budget
as restrictive
for all
to anon, authenticated
using (false)
with check (false);
