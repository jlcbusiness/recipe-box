update public.recipe_picklist_values
set sort_order = case value
  when 'Favorite' then 0
  when 'Delicious' then 1
  when 'Staple' then 2
  when 'Practice' then 3
  when 'Try again' then 4
  when 'Occasionally' then 5
  when 'Specific occasion' then 6
  when 'Once-a-year-rich' then 7
  when 'So-so' then 8
  when 'No' then 9
  when 'Hell no' then 10
  when 'MISTAKE' then 11
end
where category = 'verdict'
  and value in (
    'Favorite',
    'Delicious',
    'Staple',
    'Practice',
    'Try again',
    'Occasionally',
    'Specific occasion',
    'Once-a-year-rich',
    'So-so',
    'No',
    'Hell no',
    'MISTAKE'
  );

create or replace function public.seed_recipe_picklists_after_account_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.seed_recipe_picklists_for_account(new.id);

  update public.recipe_picklist_values
  set sort_order = case value
    when 'Favorite' then 0
    when 'Delicious' then 1
    when 'Staple' then 2
    when 'Practice' then 3
    when 'Try again' then 4
    when 'Occasionally' then 5
    when 'Specific occasion' then 6
    when 'Once-a-year-rich' then 7
    when 'So-so' then 8
    when 'No' then 9
    when 'Hell no' then 10
    when 'MISTAKE' then 11
  end
  where account_id = new.id
    and category = 'verdict'
    and value in (
      'Favorite',
      'Delicious',
      'Staple',
      'Practice',
      'Try again',
      'Occasionally',
      'Specific occasion',
      'Once-a-year-rich',
      'So-so',
      'No',
      'Hell no',
      'MISTAKE'
    );

  return new;
end;
$$;
