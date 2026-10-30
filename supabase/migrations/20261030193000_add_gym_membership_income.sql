-- Add a dedicated Gym Membership income category while preserving existing entries.
BEGIN;

ALTER TABLE public.cafeteria_finance_entries
 DROP CONSTRAINT IF EXISTS cafeteria_finance_entries_category_check;
ALTER TABLE public.cafeteria_finance_entries
 ADD CONSTRAINT cafeteria_finance_entries_category_check CHECK (category IN (
  'padel_courts','pickleball_courts','basketball_courts','grips','balls',
  'racket_rental','clothes','racket_sold','gymnastics','classes','pt_gym',
  'gym_membership','summer_camp','shoes','basketball_academy','other_income',
  'general_payment','coaches','cafeteria_stock','family_debt','other_expense'
 ));

CREATE OR REPLACE FUNCTION public.cafeteria_finance_record_entry(
 p_entry_id uuid,p_entry_date date,p_category text,p_name text,
 p_amount_cents bigint,p_quantity integer,p_unit_price_cents bigint,
 p_checkmarks boolean[]
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,pg_temp AS $$
DECLARE
 v_date date:=(now() at time zone 'Asia/Beirut')::date;
 v_existing public.cafeteria_finance_entries%rowtype;
 v_name text:=btrim(coalesce(p_name,''));
 v_markers boolean[]:=coalesce(p_checkmarks,array[false,false,false,false]);
BEGIN
 IF NOT public.is_staff() THEN RAISE EXCEPTION 'Authorized staff only'; END IF;
 IF p_entry_id IS NULL THEN RAISE EXCEPTION 'Missing entry ID'; END IF;
 IF p_entry_date IS NULL OR p_entry_date>v_date THEN RAISE EXCEPTION 'Choose today or an earlier date'; END IF;
 IF p_category IS NULL OR p_category NOT IN (
   'padel_courts','pickleball_courts','basketball_courts',
   'grips','balls','racket_rental','clothes','racket_sold','gymnastics','classes','pt_gym','gym_membership','summer_camp','shoes','basketball_academy','other_income',
   'general_payment','coaches','cafeteria_stock','family_debt','other_expense')
 THEN RAISE EXCEPTION 'Invalid category'; END IF;
 IF char_length(v_name)>120 THEN RAISE EXCEPTION 'Entry name is too long'; END IF;
 IF p_category IN ('padel_courts','pickleball_courts','basketball_courts','other_income','other_expense')
    AND char_length(v_name)<1 THEN RAISE EXCEPTION 'Enter a name or description'; END IF;
 IF p_amount_cents IS NULL OR p_amount_cents NOT BETWEEN 1 AND 100000000000
   THEN RAISE EXCEPTION 'Amount must be positive'; END IF;
 IF p_quantity IS NULL OR p_quantity NOT BETWEEN 1 AND 9999
   THEN RAISE EXCEPTION 'Quantity must be between 1 and 9999'; END IF;
 IF p_unit_price_cents IS NULL OR p_unit_price_cents NOT BETWEEN 0 AND 100000000000
   THEN RAISE EXCEPTION 'Invalid unit price'; END IF;
 IF array_ndims(v_markers)<>1 OR ((p_category='basketball_courts' AND array_length(v_markers,1)<>6) OR (p_category<>'basketball_courts' AND array_length(v_markers,1)<>4)) OR array_position(v_markers,NULL) IS NOT NULL
   THEN RAISE EXCEPTION 'Incorrect number of player payment markers'; END IF;
 IF p_category IN ('grips','balls','racket_rental') THEN
   IF p_unit_price_cents<1 OR p_amount_cents<>p_quantity*p_unit_price_cents
   THEN RAISE EXCEPTION 'Sale quantity and unit price do not match total'; END IF;
   IF p_category='racket_rental' AND p_unit_price_cents<>200
   THEN RAISE EXCEPTION 'Racket rental is fixed at $2.00 each'; END IF;
 ELSE
   IF p_quantity<>1 OR p_unit_price_cents<>0 THEN RAISE EXCEPTION 'Invalid quantity or price for this category'; END IF;
 END IF;
 IF p_category NOT IN ('padel_courts','pickleball_courts','basketball_courts') AND
    v_markers<>array[false,false,false,false]
   THEN RAISE EXCEPTION 'Four markers are only available for court bookings'; END IF;
 SELECT * INTO v_existing FROM public.cafeteria_finance_entries WHERE id=p_entry_id;
 IF FOUND THEN
   IF v_existing.created_by=auth.uid() AND v_existing.entry_date=p_entry_date AND
      v_existing.category=p_category AND v_existing.name=v_name AND
      v_existing.amount_cents=p_amount_cents AND v_existing.quantity=p_quantity AND
      v_existing.unit_price_cents=p_unit_price_cents AND v_existing.voided_at IS NULL
     THEN RETURN p_entry_id; END IF;
   RAISE EXCEPTION 'Entry ID already used';
 END IF;
 INSERT INTO public.cafeteria_finance_entries(
   id,entry_date,category,name,amount_cents,quantity,unit_price_cents,checkmarks,created_by)
 VALUES(p_entry_id,p_entry_date,p_category,v_name,p_amount_cents,p_quantity,p_unit_price_cents,v_markers,auth.uid());
 INSERT INTO public.audit_logs(actor,action,entity,entity_id,after_data)
 VALUES(auth.uid(),'CREATE','cafeteria_finance_entries',p_entry_id::text,
  jsonb_build_object('date',p_entry_date,'category',p_category,'name',v_name,'amount_cents',p_amount_cents,
    'quantity',p_quantity,'unit_price_cents',p_unit_price_cents,'markers',v_markers));
 RETURN p_entry_id;
END;$$;

REVOKE ALL ON FUNCTION public.cafeteria_finance_record_entry(uuid,date,text,text,bigint,integer,bigint,boolean[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cafeteria_finance_record_entry(uuid,date,text,text,bigint,integer,bigint,boolean[]) TO authenticated;

COMMIT;
