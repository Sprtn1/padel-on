-- Atomic per-player paid status. Separate updates by staff never overwrite other players.
begin;
create or replace function public.cafeteria_finance_set_player_paid(
 p_entry_id uuid,p_player_no integer,p_paid boolean
) returns void language plpgsql security definer
set search_path=public,pg_temp as $$
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
 v_count:=case when v_previous.category='basketball_courts' then 6 else 4 end;
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
$$;
revoke all on function public.cafeteria_finance_set_player_paid(uuid,integer,boolean) from public,anon;
grant execute on function public.cafeteria_finance_set_player_paid(uuid,integer,boolean) to authenticated;
commit;
