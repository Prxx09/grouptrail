-- No coordinates or route history. One quota row per beta user, plus global budget.
create table public.routing_budget (
  subject text primary key,
  day date not null,
  day_count integer not null default 0,
  minute timestamptz not null,
  minute_count integer not null default 0
);
alter table public.routing_budget enable row level security;
revoke all on public.routing_budget from public, anon, authenticated;
grant select, insert, update on public.routing_budget to service_role;

-- Only the server-side Edge Function can invoke this; no SECURITY DEFINER.
create function public.consume_route_budget(p_user_id uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  v_day date := (now() at time zone 'UTC')::date;
  v_minute timestamptz := date_trunc('minute', now());
  v_subject text;
  v_row public.routing_budget%rowtype;
begin
  if p_user_id is null then return false; end if;
  -- Serializes budget checks across all function instances and concurrent callers.
  perform pg_advisory_xact_lock(817492601);
  foreach v_subject in array array['global', p_user_id::text] loop
    select * into v_row from public.routing_budget where subject = v_subject;
    if found then
      if v_row.day = v_day and v_row.day_count >= case when v_subject = 'global' then 500 else 100 end then return false; end if;
      if v_row.minute = v_minute and v_row.minute_count >= case when v_subject = 'global' then 20 else 4 end then return false; end if;
    end if;
  end loop;
  foreach v_subject in array array['global', p_user_id::text] loop
    insert into public.routing_budget(subject, day, day_count, minute, minute_count)
    values(v_subject, v_day, 1, v_minute, 1)
    on conflict(subject) do update set
      day = v_day,
      day_count = case when routing_budget.day = v_day then routing_budget.day_count + 1 else 1 end,
      minute = v_minute,
      minute_count = case when routing_budget.minute = v_minute then routing_budget.minute_count + 1 else 1 end;
  end loop;
  return true;
end;
$$;
revoke all on function public.consume_route_budget(uuid) from public, anon, authenticated;
grant execute on function public.consume_route_budget(uuid) to service_role;
