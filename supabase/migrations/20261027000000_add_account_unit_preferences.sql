alter table public.accounts
  add column volume_system text not null default 'us_customary'
    constraint accounts_volume_system_check
    check (volume_system in ('us_customary', 'metric')),
  add column weight_system text not null default 'us_customary'
    constraint accounts_weight_system_check
    check (weight_system in ('us_customary', 'metric'));

create function public.update_account_unit_preferences(
  p_volume_system text default null,
  p_weight_system text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account_id uuid := (select auth.uid());
begin
  if v_account_id is null then
    raise exception 'Authentication required';
  end if;

  if p_volume_system is not null
    and p_volume_system not in ('us_customary', 'metric') then
    raise exception 'Unsupported volume measurement system';
  end if;

  if p_weight_system is not null
    and p_weight_system not in ('us_customary', 'metric') then
    raise exception 'Unsupported weight measurement system';
  end if;

  update public.accounts
  set
    volume_system = coalesce(p_volume_system, volume_system),
    weight_system = coalesce(p_weight_system, weight_system)
  where id = v_account_id;

  if not found then
    raise exception 'Account not found';
  end if;
end;
$$;

revoke all on function public.update_account_unit_preferences(text, text)
  from public, anon;
grant execute on function public.update_account_unit_preferences(text, text)
  to authenticated;