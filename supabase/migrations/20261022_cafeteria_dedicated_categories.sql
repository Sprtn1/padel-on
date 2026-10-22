-- Add dedicated Summer Camp, Shoes, Basketball Academy and Family Debt categories.
-- Preserve all existing records, authorization, and audit logging. 
begin;
alter table public.cafeteria_finance_entries
  drop constraint if exists cafeteria_finance_entries_category_check;
alter table public.cafeteria_finance_entries
  add constraint cafeteria_finance_entries_category_check
  check (category in ('padel_courts','pickleball_courts','basketball_courts','grips','balls','racket_rental','clothes','racket_sold','gymnastics','classes','pt_gym','summer_camp','shoes','basketball_academy','other_income','general_payment','coaches','cafeteria_stock','family_debt','other_expense'));

create or replace function public.cafeteria_finance_record_entry(
  p_entry_id uuid,p_entry_date date,p_category text,p_name text,
  p_amount_cents bigint,p_quantity integer,p_unit_price_cents bigint,
  p_checkmarks boolean[]
) returns uuid language plpgsql security definer
set search_path=public,pg_temp as $$
declare
 v_date date:=(now() at time zone 'Asia/Beirut')::date;
 v_existing public.cafeteria_finance_entries%rowtype;
 v_name text:=btrim(coalesce(p_name,''));
 v_markers boolean[]:=coalesce(p_checkmarks,array[false,false,false,false]);
begin
 if not public.is_staff() then raise exception 'Authorized staff only'; end if;
 if p_entry_id is null then raise exception 'Missing entry ID'; end if;
 if p_entry_date is null or p_entry_date>v_date then raise exception 'Choose today or an earlier date'; end if;
 if p_category is null or p_category not in (
   'padel_courts','pickleball_courts','basketball_courts',
   'grips','balls','racket_rental','clothes','racket_sold','gymnastics','classes','pt_gym','summer_camp','shoes','basketball_academy','other_income',
   'general_payment','coaches','cafeteria_stock','family_debt','other_expense')
 then raise exception 'Invalid category'; end if;
 if char_length(v_name)>120 then raise exception 'Entry name is too long'; end if;
 if p_category in ('padel_courts','pickleball_courts','basketball_courts','other_income','other_expense')
    and char_length(v_name)<1 then raise exception 'Enter a name or description'; end if;
 if p_amount_cents is null or p_amount_cents not between 1 and 100000000000
   then raise exception 'Amount must be positive'; end if;
 if p_quantity is null or p_quantity not between 1 and 9999
   then raise exception 'Quantity must be between 1 and 9999'; end if;
 if p_unit_price_cents is null or p_unit_price_cents not between 0 and 100000000000
   then raise exception 'Invalid unit price'; end if;
 if array_ndims(v_markers)<>1 or ((p_category='basketball_courts' and array_length(v_markers,1)<>6) or (p_category<>'basketball_courts' and array_length(v_markers,1)<>4)) or array_position(v_markers,null) is not null
   then raise exception 'Incorrect number of player payment markers'; end if;
 if p_category in ('grips','balls','racket_rental') then
   if p_unit_price_cents<1 or p_amount_cents<>p_quantity*p_unit_price_cents
   then raise exception 'Sale quantity and unit price do not match total'; end if;
   if p_category='racket_rental' and p_unit_price_cents<>200
   then raise exception 'Racket rental is fixed at $2.00 each'; end if;
 else
   if p_quantity<>1 or p_unit_price_cents<>0 then raise exception 'Invalid quantity or price for this category'; end if;
 end if;
 if p_category not in ('padel_courts','pickleball_courts','basketball_courts') and
    v_markers<>array[false,false,false,false]
   then raise exception 'Four markers are only available for court bookings'; end if;
 select * into v_existing from public.cafeteria_finance_entries where id=p_entry_id;
 if found then
   if v_existing.created_by=auth.uid() and v_existing.entry_date=p_entry_date and
      v_existing.category=p_category and v_existing.name=v_name and
      v_existing.amount_cents=p_amount_cents and v_existing.quantity=p_quantity and
      v_existing.unit_price_cents=p_unit_price_cents and v_existing.voided_at is null
     then return p_entry_id; end if;
   raise exception 'Entry ID already used';
 end if;
 insert into public.cafeteria_finance_entries(
   id,entry_date,category,name,amount_cents,quantity,unit_price_cents,checkmarks,created_by)
 values(p_entry_id,p_entry_date,p_category,v_name,p_amount_cents,p_quantity,p_unit_price_cents,v_markers,auth.uid());
 insert into public.audit_logs(actor,action,entity,entity_id,after_data)
 values(auth.uid(),'CREATE','cafeteria_finance_entries',p_entry_id::text,
  jsonb_build_object('date',p_entry_date,'category',p_category,'name',v_name,'amount_cents',p_amount_cents,
    'quantity',p_quantity,'unit_price_cents',p_unit_price_cents,'markers',v_markers));
 return p_entry_id;
end;$$;


commit;
