alter table public.accounts
  add column hand_preference text not null default 'right'
    constraint accounts_hand_preference_check
    check (hand_preference in ('left', 'right'));

drop function public.update_account_unit_preferences(text, text, text);

create function public.update_account_unit_preferences(
  p_volume_system text default null,
  p_weight_system text default null,
  p_ingredient_presentation text default null,
  p_hand_preference text default null
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

  if p_ingredient_presentation is not null
    and p_ingredient_presentation not in ('standard', 'ingredient_first') then
    raise exception 'Unsupported ingredient presentation';
  end if;

  if p_hand_preference is not null
    and p_hand_preference not in ('left', 'right') then
    raise exception 'Unsupported hand preference';
  end if;

  update public.accounts
  set
    volume_system = coalesce(p_volume_system, volume_system),
    weight_system = coalesce(p_weight_system, weight_system),
    ingredient_presentation = coalesce(p_ingredient_presentation, ingredient_presentation),
    hand_preference = coalesce(p_hand_preference, hand_preference)
  where id = v_account_id;

  if not found then
    raise exception 'Account not found';
  end if;
end;
$$;

revoke all on function public.update_account_unit_preferences(text, text, text, text)
  from public, anon;
grant execute on function public.update_account_unit_preferences(text, text, text, text)
  to authenticated;
