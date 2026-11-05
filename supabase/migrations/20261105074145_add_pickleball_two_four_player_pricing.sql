-- Applies per-person pickleball pricing without recalculating historical booking amounts.

-- Per-person pickleball pricing: store 2- or 4-player group size for bookings.
-- Preserve all existing prices; existing bookings default to 4 for compatibility.
alter table public.cafeteria_finance_entries
 add column pickleball_player_count smallint not null default 4
 check(pickleball_player_count in(2,4));

create function public.cafeteria_finance_record_pickleball_booking(
 p_entry_id uuid,p_entry_date date,p_name text,p_amount_cents bigint,
 p_checkmarks boolean[],p_court_notes text,p_start text,p_end text,
 p_player_count integer
) returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_id uuid;v_old public.cafeteria_finance_entries%rowtype;
begin
 if auth.uid() is null or not public.is_staff() then raise exception 'Authorized staff only'; end if;
 if p_entry_id is null then raise exception 'Missing booking reference';end if;
 if p_player_count is null or p_player_count not in(2,4) then raise exception 'Pickleball requires 2 or 4 players';end if;
 if coalesce(array_length(p_checkmarks,1),0)<>4 or
    (p_player_count=2 and (coalesce(p_checkmarks[3],false) or coalesce(p_checkmarks[4],false))) then
  raise exception 'Two-player bookings must use player markers 1 and 2 only';
 end if;
 perform pg_advisory_xact_lock(hashtext('pickleball_booking_id'),hashtext(p_entry_id::text));
 select * into v_old from public.cafeteria_finance_entries where id=p_entry_id for update;
 if v_old.id is not null and (v_old.category<>'pickleball_courts' or
   v_old.pickleball_player_count<>p_player_count) then
  raise exception 'Booking player count changed; refresh first';
 end if;
 v_id:=public.cafeteria_finance_record_court_booking(
  p_entry_id,p_entry_date,'pickleball_courts',p_name,p_amount_cents,1,0,
  p_checkmarks,p_court_notes,null,p_start,p_end);
 if v_old.id is null then
  update public.cafeteria_finance_entries
   set pickleball_player_count=p_player_count where id=v_id;
  insert into public.audit_logs(actor,action,entity,entity_id,after_data)
   values(auth.uid(),'UPDATE','cafeteria_finance_entries',v_id::text,
    jsonb_build_object('pickleball_player_count',p_player_count));
 end if;
 return v_id;
end$$;

create function public.cafeteria_finance_update_pickleball_booking(
 p_entry_id uuid,p_amount_cents bigint,p_expected_amount_cents bigint,
 p_start text,p_end text,p_expected_start text,p_expected_end text,
 p_player_count integer,p_expected_player_count integer
) returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_old public.cafeteria_finance_entries%rowtype;
begin
 if auth.uid() is null or not public.is_staff() then raise exception 'Authorized staff only';end if;
 if p_player_count is null or p_player_count not in(2,4) then raise exception 'Pickleball requires 2 or 4 players';end if;
 select * into v_old from public.cafeteria_finance_entries where id=p_entry_id for update;
 if not found or v_old.voided_at is not null or v_old.category<>'pickleball_courts' then
  raise exception 'Pickleball booking not found';
 end if;
 if v_old.pickleball_player_count is distinct from p_expected_player_count then
  raise exception 'Another staff member changed the player count. Refresh first';
 end if;
 if p_player_count=2 and (coalesce(v_old.checkmarks[3],false) or coalesce(v_old.checkmarks[4],false)) then
  raise exception 'Uncheck paid markers for players 3 and 4 before switching to 2 players';
 end if;
 perform public.cafeteria_finance_set_booking_details(
  p_entry_id,p_amount_cents,p_expected_amount_cents,
  null,p_start,p_end,null,p_expected_start,p_expected_end);
 if v_old.pickleball_player_count is distinct from p_player_count then
  update public.cafeteria_finance_entries
   set pickleball_player_count=p_player_count where id=p_entry_id;
  insert into public.audit_logs(actor,action,entity,entity_id,before_data,after_data)
   values(auth.uid(),'UPDATE','cafeteria_finance_entries',p_entry_id::text,
    jsonb_build_object('pickleball_player_count',v_old.pickleball_player_count),
    jsonb_build_object('pickleball_player_count',p_player_count));
 end if;
 return p_entry_id;
end$$;

-- Restrict payment-status toggles to the actual number of players.
CREATE OR REPLACE FUNCTION public.cafeteria_finance_set_player_paid(p_entry_id uuid, p_player_no integer, p_paid boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
 v_previous public.cafeteria_finance_entries%rowtype;
 v_count integer;
 v_checks boolean[];
begin
 if not public.is_staff() then raise exception 'Authorized staff only'; end if;
 if p_paid is null then raise exception 'Paid status is required'; end if;
 select * into v_previous from public.cafeteria_finance_entries where id=p_entry_id for update;
 if not found or v_previous.voided_at is not null then raise exception 'Court entry not found'; end if;
 if v_previous.category not in ('padel_courts','pickleball_courts','basketball_courts')
 then raise exception 'Player payments apply only to court bookings'; end if;
 v_count:=case when v_previous.category='basketball_courts' then 6 when v_previous.category='pickleball_courts' then v_previous.pickleball_player_count else 4 end;
 if p_player_no is null or p_player_no<1 or p_player_no>v_count
 then raise exception 'Invalid player number'; end if;
 if v_previous.checkmarks[p_player_no]=p_paid then return; end if;
 v_checks:=v_previous.checkmarks;
 v_checks[p_player_no]:=p_paid;
 update public.cafeteria_finance_entries set checkmarks=v_checks where id=p_entry_id;
 insert into public.audit_logs(actor,action,entity,entity_id,before_data,after_data)
 values(auth.uid(),'UPDATE','cafeteria_finance_entries',p_entry_id::text,
 jsonb_build_object('player',p_player_no,'paid',v_previous.checkmarks[p_player_no]),
 jsonb_build_object('player',p_player_no,'paid',p_paid));
end;
$function$;

revoke all on function public.cafeteria_finance_record_pickleball_booking(uuid,date,text,bigint,boolean[],text,text,text,integer) from public,anon;
revoke all on function public.cafeteria_finance_update_pickleball_booking(uuid,bigint,bigint,text,text,text,text,integer,integer) from public,anon;
grant execute on function public.cafeteria_finance_record_pickleball_booking(uuid,date,text,bigint,boolean[],text,text,text,integer) to authenticated;
grant execute on function public.cafeteria_finance_update_pickleball_booking(uuid,bigint,bigint,text,text,text,text,integer,integer) to authenticated;

