create or replace function public.recipe_state_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.state = 'want_to_try' and new.verdict_id is not null then
    raise exception 'A Want to try recipe cannot have a Verdict.' using errcode = '23514';
  elsif new.state = 'tried' and new.enthusiasm_id is not null then
    raise exception 'A Tried recipe cannot have an Enthusiasm.' using errcode = '23514';
  elsif new.state = 'will_not_try'
    and (new.verdict_id is not null or new.enthusiasm_id is not null or new.occasion_details is not null) then
    raise exception 'A Will not try recipe cannot have a Verdict, Enthusiasm, or Occasion Details.'
      using errcode = '23514';
  end if;

  if new.occasion_details is not null and not (
    (
      new.state = 'want_to_try'
      and exists (
        select 1 from public.recipe_picklist_values as picklist
        where picklist.account_id = new.account_id
          and picklist.category = 'enthusiasm'
          and picklist.id = new.enthusiasm_id
          and picklist.value = 'Specific occasion'
      )
    )
    or (
      new.state = 'tried'
      and exists (
        select 1 from public.recipe_picklist_values as picklist
        where picklist.account_id = new.account_id
          and picklist.category = 'verdict'
          and picklist.id = new.verdict_id
          and picklist.value = 'Specific occasion'
      )
    )
  ) then
    raise exception 'Occasion Details require Specific occasion.' using errcode = '23514';
  end if;

  return new;
end;
$$;