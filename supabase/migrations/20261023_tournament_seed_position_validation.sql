-- Require a one-to-one mapping between declared seeds and reserved bracket positions.
begin;
create or replace function public.tournament_reseed(
 p_id uuid, p_expected_version bigint, p_placements jsonb, p_matches jsonb
) returns bigint language plpgsql security definer set search_path=public,pg_temp as $$
declare
 t public.tournaments%rowtype; m jsonb; tmatch jsonb; parent_a jsonb; parent_b jsonb; p jsonb;
 old_entrants text[]:=array[]::text[]; new_entrants text[]:=array[]::text[];
 seen_slots text[]:=array[]::text[]; seen_placements text[]:=array[]::text[];
 total integer; rounds integer; round_no integer; slot_no integer; match_count integer;
 child_slot integer; ca integer; cb integer; pa integer; pb integer;
 expected_a text; expected_b text; expected_win text; original_id text;
 sid text; side text; stage text; stage_offset integer; stage_round integer;
 found_count integer:=0; expected_id text; stage_slot integer;
begin
 if not public.is_staff() then raise exception 'Staff authorization required';end if;
 select * into t from public.tournaments where id=p_id for update;
 if not found then raise exception 'Tournament not found';end if;
 if t.version is distinct from p_expected_version
 then raise exception 'Tournament changed on another device. Refresh and try again';end if;
 if not exists(select 1 from jsonb_array_elements(t.state->'matches') x where x->>'phase'='knockout')
 then raise exception 'Generate the knockout bracket before seeding';end if;
 if exists(select 1 from jsonb_array_elements(t.state->'matches') x
     where x->>'phase'='knockout' and jsonb_array_length(coalesce(x->'sets','[]'::jsonb))>0)
 then raise exception 'Seeding is locked after the first knockout score';end if;
 if jsonb_typeof(p_placements)<>'array' or jsonb_typeof(p_matches)<>'array'
 then raise exception 'Invalid bracket format';end if;
 match_count:=jsonb_array_length(p_matches);
 if match_count<3 or match_count>127 then raise exception 'Invalid bracket size';end if;
 rounds:=floor(ln(match_count+1)/ln(2))::integer;
 if rounds<2 or rounds>7 or match_count<>(power(2,rounds)::integer-1)
 then raise exception 'The bracket must contain complete knockout rounds';end if;

 if jsonb_typeof(t.state->'knockoutEntrants')='array' then
  for m in select value from jsonb_array_elements(t.state->'knockoutEntrants') loop
   old_entrants:=array_append(old_entrants,m#>>'{}');
  end loop;
 else
  for m in select value from jsonb_array_elements(t.state->'matches')
      where value->>'phase'='knockout' and value->>'round'='1' loop
   if m->>'a' is not null then old_entrants:=array_append(old_entrants,m->>'a');end if;
   if m->>'b' is not null then old_entrants:=array_append(old_entrants,m->>'b');end if;
  end loop;
  for m in select value from jsonb_array_elements(coalesce(t.state->'seedPlacements','[]'::jsonb)) loop
    if m->>'team' is not null then old_entrants:=array_append(old_entrants,m->>'team');end if;
  end loop;
 end if;
 select array_agg(distinct x) into old_entrants from unnest(old_entrants) x;
 total:=coalesce(array_length(old_entrants,1),0);
 if total<2 or total>32 then raise exception 'Invalid knockout entrants';end if;
 if jsonb_array_length(p_placements)>total then raise exception 'Too many seeded teams';end if;

 for p in select value from jsonb_array_elements(p_placements) loop
   sid:=p->>'team';stage:=p->>'stage';side:=p->>'side';
   stage_slot:=case when coalesce(p->>'slot','')~'^[1-9][0-9]*$'
     then (p->>'slot')::integer else 0 end;
   stage_offset:=case stage when 'final' then 0 when 'semifinal' then 1
     when 'quarterfinal' then 2 else -1 end;
   if stage_offset<0 or rounds<stage_offset+2 or
      stage_slot<1 or stage_slot>power(2,stage_offset)::integer or
      side not in ('a','b') or sid is null or not (sid=any(old_entrants)) or
      sid=any(seen_placements)
   then raise exception 'Invalid or duplicate seeded team placement';end if;
   stage_round:=rounds-stage_offset;
   expected_id:='k'||stage_round||'-'||stage_slot;
   if not exists(select 1 from jsonb_array_elements(p_matches) x
       where x->>'id'=expected_id and x->>(case when side='a' then 'seedA' else 'seedB' end)=sid)
   then raise exception 'Seed placement does not match the bracket';end if;
   seen_placements:=array_append(seen_placements,sid);
 end loop;

 for round_no in 1..rounds loop
  for slot_no in 1..(power(2,rounds-round_no)::integer) loop
   expected_id:='k'||round_no||'-'||slot_no;
   select x.value into m from jsonb_array_elements(p_matches) x where x.value->>'id'=expected_id;
   if m is null or m->>'phase'<>'knockout' or
      m->>'round' is distinct from round_no::text or m->>'slot' is distinct from slot_no::text or
      coalesce(m->'sets','null'::jsonb)<>'[]'::jsonb
   then raise exception 'The bracket contains missing, invalid, or played fixtures';end if;
   if expected_id=any(seen_slots)then raise exception 'Duplicate match';end if;
   seen_slots:=array_append(seen_slots,expected_id);
   sid:=m->>'seedA';side:=m->>'seedB';
   if round_no=1 then
      if sid is not null or side is not null then raise exception 'First-round seeds must enter through ordinary positions';end if;
      expected_a:=m->>'a';expected_b:=m->>'b';
      pa:=case when expected_a is null then 0 else 1 end;
      pb:=case when expected_b is null then 0 else 1 end;
      if expected_a is not null then new_entrants:=array_append(new_entrants,expected_a);end if;
      if expected_b is not null then new_entrants:=array_append(new_entrants,expected_b);end if;
   else
      select x.value into parent_a from jsonb_array_elements(p_matches) x
       where x.value->>'id'='k'||(round_no-1)||'-'||(slot_no*2-1);
      select x.value into parent_b from jsonb_array_elements(p_matches) x
       where x.value->>'id'='k'||(round_no-1)||'-'||(slot_no*2);
      if parent_a is null or parent_b is null then raise exception 'Incomplete preceding round';end if;
      ca:=(parent_a->>'possibleA')::integer+(parent_a->>'possibleB')::integer;
      cb:=(parent_b->>'possibleA')::integer+(parent_b->>'possibleB')::integer;
      if sid is not null and ca<>0 or side is not null and cb<>0
      then raise exception 'Seed overlaps a team from an earlier round';end if;
      expected_a:=coalesce(sid,parent_a->>'winner');
      expected_b:=coalesce(side,parent_b->>'winner');
      pa:=case when sid is not null then 1 else ca end;
      pb:=case when side is not null then 1 else cb end;
      if sid is not null then new_entrants:=array_append(new_entrants,sid);end if;
      if side is not null then new_entrants:=array_append(new_entrants,side);end if;
   end if;
   if m->>'a' is distinct from expected_a or m->>'b' is distinct from expected_b or
      coalesce(m->>'possibleA','')<>pa::text or
      coalesce(m->>'possibleB','')<>pb::text
   then raise exception 'Invalid knockout advancement or seed positions';end if;
   expected_win:=case when pa>0 and pb=0 then expected_a
                  when pb>0 and pa=0 then expected_b else null end;
   if m->>'winner' is distinct from expected_win
   then raise exception 'Invalid automatic bye or winner';end if;
  end loop;
 end loop;
 if array_length(seen_slots,1)<>match_count then raise exception 'Duplicate knockout matches';end if;
 if coalesce(array_length(new_entrants,1),0)<>total or
    (select count(distinct x) from unnest(new_entrants) x)<>total or
    exists(select 1 from unnest(new_entrants) x where not x=any(old_entrants))
 then raise exception 'Each qualified team must appear exactly once in the knockout draw';end if;
 if (select coalesce(sum(
       (case when x->>'seedA' is not null then 1 else 0 end)
       +(case when x->>'seedB' is not null then 1 else 0 end)),0)
      from jsonb_array_elements(p_matches) x)<>jsonb_array_length(p_placements)
 then raise exception 'Unexpected seeded positions';end if;

 t.state:=jsonb_set(t.state,'{matches}',(
   select coalesce(jsonb_agg(value),'[]'::jsonb) from jsonb_array_elements(t.state->'matches') x
   where x.value->>'phase'<>'knockout')||p_matches);
 t.state:=jsonb_set(t.state,'{seedPlacements}',p_placements);
 t.state:=jsonb_set(t.state,'{knockoutEntrants}',to_jsonb(old_entrants));
 update public.tournaments set state=t.state,version=version+1 where id=p_id
 returning version into total;
 return total;
end;
$$;
commit;