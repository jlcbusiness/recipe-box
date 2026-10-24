alter table public.accounts
  add column ingredient_color text not null default 'blue'
    constraint accounts_ingredient_color_check
    check (ingredient_color in ('blue', 'green', 'teal', 'red', 'orange', 'none')),
  add column temperature_color text not null default 'red'
    constraint accounts_temperature_color_check
    check (temperature_color in ('blue', 'green', 'teal', 'red', 'orange', 'none')),
  add column duration_color text not null default 'orange'
    constraint accounts_duration_color_check
    check (duration_color in ('blue', 'green', 'teal', 'red', 'orange', 'none')),
  add column private_print_uses_colors boolean not null default true;

drop function public.update_account_unit_preferences(text, text, text, text);

create function public.update_account_unit_preferences(
  p_volume_system text default null,
  p_weight_system text default null,
  p_ingredient_presentation text default null,
  p_hand_preference text default null,
  p_ingredient_color text default null,
  p_temperature_color text default null,
  p_duration_color text default null,
  p_private_print_uses_colors boolean default null
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

  if p_ingredient_color is not null
    and p_ingredient_color not in ('blue', 'green', 'teal', 'red', 'orange', 'none') then
    raise exception 'Unsupported ingredient color';
  end if;

  if p_temperature_color is not null
    and p_temperature_color not in ('blue', 'green', 'teal', 'red', 'orange', 'none') then
    raise exception 'Unsupported temperature color';
  end if;

  if p_duration_color is not null
    and p_duration_color not in ('blue', 'green', 'teal', 'red', 'orange', 'none') then
    raise exception 'Unsupported duration color';
  end if;

  update public.accounts
  set
    volume_system = coalesce(p_volume_system, volume_system),
    weight_system = coalesce(p_weight_system, weight_system),
    ingredient_presentation = coalesce(p_ingredient_presentation, ingredient_presentation),
    hand_preference = coalesce(p_hand_preference, hand_preference),
    ingredient_color = coalesce(p_ingredient_color, ingredient_color),
    temperature_color = coalesce(p_temperature_color, temperature_color),
    duration_color = coalesce(p_duration_color, duration_color),
    private_print_uses_colors = coalesce(p_private_print_uses_colors, private_print_uses_colors)
  where id = v_account_id;

  if not found then
    raise exception 'Account not found';
  end if;
end;
$$;

revoke all on function public.update_account_unit_preferences(
  text, text, text, text, text, text, text, boolean
) from public, anon;
grant execute on function public.update_account_unit_preferences(
  text, text, text, text, text, text, text, boolean
) to authenticated;