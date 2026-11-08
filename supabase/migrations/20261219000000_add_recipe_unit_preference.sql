alter table public.accounts
  drop constraint accounts_volume_system_check,
  add constraint accounts_volume_system_check
    check (volume_system in ('us_customary', 'metric', 'recipe')),
  drop constraint accounts_weight_system_check,
  add constraint accounts_weight_system_check
    check (weight_system in ('us_customary', 'metric', 'recipe'));

create or replace function public.update_account_unit_preferences_without_private_details(
  p_volume_system text default null,
  p_weight_system text default null,
  p_ingredient_presentation text default null,
  p_hand_preference text default null,
  p_ingredient_color text default null,
  p_temperature_color text default null,
  p_duration_color text default null,
  p_private_print_uses_colors boolean default null,
  p_temperature_system text default null,
  p_include_instruction_photos_in_private_print boolean default null,
  p_repeat_ingredients_in_private_print boolean default null
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
    and p_volume_system not in ('us_customary', 'metric', 'recipe') then
    raise exception 'Unsupported volume measurement system';
  end if;

  if p_weight_system is not null
    and p_weight_system not in ('us_customary', 'metric', 'recipe') then
    raise exception 'Unsupported weight measurement system';
  end if;

  if p_temperature_system is not null
    and p_temperature_system not in ('fahrenheit', 'celsius') then
    raise exception 'Unsupported temperature measurement system';
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
    and p_ingredient_color not in (
      'black', 'navy', 'dark_blue', 'dark_green', 'teal', 'dark_red',
      'dark_orange', 'dark_purple', 'none', 'red', 'orange', 'yellow',
      'green', 'blue', 'purple', 'pink'
    ) then
    raise exception 'Unsupported ingredient color';
  end if;

  if p_temperature_color is not null
    and p_temperature_color not in (
      'black', 'navy', 'dark_blue', 'dark_green', 'teal', 'dark_red',
      'dark_orange', 'dark_purple', 'none', 'red', 'orange', 'yellow',
      'green', 'blue', 'purple', 'pink'
    ) then
    raise exception 'Unsupported temperature color';
  end if;

  if p_duration_color is not null
    and p_duration_color not in (
      'black', 'navy', 'dark_blue', 'dark_green', 'teal', 'dark_red',
      'dark_orange', 'dark_purple', 'none', 'red', 'orange', 'yellow',
      'green', 'blue', 'purple', 'pink'
    ) then
    raise exception 'Unsupported duration color';
  end if;

  update public.accounts
  set
    volume_system = coalesce(p_volume_system, volume_system),
    weight_system = coalesce(p_weight_system, weight_system),
    temperature_system = coalesce(p_temperature_system, temperature_system),
    ingredient_presentation = coalesce(p_ingredient_presentation, ingredient_presentation),
    hand_preference = coalesce(p_hand_preference, hand_preference),
    ingredient_color = coalesce(p_ingredient_color, ingredient_color),
    temperature_color = coalesce(p_temperature_color, temperature_color),
    duration_color = coalesce(p_duration_color, duration_color),
    private_print_uses_colors = coalesce(p_private_print_uses_colors, private_print_uses_colors),
    include_instruction_photos_in_private_print = coalesce(
      p_include_instruction_photos_in_private_print,
      include_instruction_photos_in_private_print
    ),
    repeat_ingredients_in_private_print = coalesce(
      p_repeat_ingredients_in_private_print,
      repeat_ingredients_in_private_print
    )
  where id = v_account_id;

  if not found then
    raise exception 'Account not found';
  end if;
end;
$$;
