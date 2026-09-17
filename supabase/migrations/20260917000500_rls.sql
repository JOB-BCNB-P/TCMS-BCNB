-- =====================================================================
-- TCMS-BCNB : 0005 Row Level Security และสิทธิ์ระดับ schema/คอลัมน์
-- =====================================================================
-- หลักการ: anon key ของ Supabase เป็นข้อมูลสาธารณะ (อยู่ในโค้ด frontend)
-- ดังนั้น "ทุกตารางใน public ต้องเปิด RLS และต้องมี policy ครบ"
-- ตารางใดที่เปิด RLS แต่ไม่มี policy = ปฏิเสธทั้งหมด (ปลอดภัยโดยปริยาย)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. สิทธิ์ระดับ schema
-- ---------------------------------------------------------------------
revoke all on schema private from anon, authenticated;
revoke all on schema audit   from anon, authenticated;
revoke all on all tables in schema private from anon, authenticated;
revoke all on all tables in schema audit   from anon, authenticated;

-- ผู้ใช้ที่ยังไม่ล็อกอิน (anon) ไม่ต้องเห็นอะไรเลย
revoke all on all tables in schema public from anon;

-- ---------------------------------------------------------------------
-- 1. เปิด RLS ทุกตารางใน public
-- ---------------------------------------------------------------------
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public'
  loop
    -- ENABLE เท่านั้น ไม่ใช้ FORCE โดยเจตนา: FORCE จะบังคับ policy กับเจ้าของตารางด้วย
    -- ซึ่งจะทำให้ SECURITY DEFINER function (trigger คำนวณยอด, RPC เปลี่ยนสถานะ,
    -- RPC เลขบัญชี) ทำงานไม่ได้ ผู้ใช้ผ่าน API คือ anon/authenticated ไม่ใช่เจ้าของตาราง
    -- จึงถูก policy บังคับครบอยู่แล้ว
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 2. ตารางอ้างอิง: ผู้ใช้ที่เปิดใช้งานแล้วอ่านได้ / แก้ไขได้เฉพาะผู้ดูแลระบบ
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'departments','academic_years','semesters','fiscal_years','banks',
    'budget_categories','roles','menus','checklist_items','app_settings',
    'voucher_number_counters'
  ] loop
    execute format($f$
      create policy %1$s_read on public.%1$I
        for select to authenticated
        using ((select public.is_active_user()));
      create policy %1$s_write on public.%1$I
        for all to authenticated
        using ((select public.is_admin()))
        with check ((select public.is_admin()));
    $f$, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 3. ผู้ใช้งานและสิทธิ์
-- ---------------------------------------------------------------------
-- ทุกคนอ่านโปรไฟล์ตัวเองได้; ผู้ดูแลระบบและผู้บริหารอ่านได้ทั้งหมด
create policy user_profiles_read_self on public.user_profiles
  for select to authenticated
  using (id = (select auth.uid()));

create policy user_profiles_read_all on public.user_profiles
  for select to authenticated
  using ((select public.current_role_code()) in ('admin','executive'));

-- ผู้ใช้แก้ได้เฉพาะชื่อ/คำนำหน้า/ตำแหน่งของตนเอง (คอลัมน์ควบคุมด้วย GRANT ด้านล่าง)
create policy user_profiles_update_self on public.user_profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy user_profiles_admin_all on public.user_profiles
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- จำกัดคอลัมน์ที่ผู้ใช้ทั่วไปอัปเดตได้ (RLS ไม่ทำระดับคอลัมน์)
revoke update on public.user_profiles from authenticated;
grant  update (prefix, first_name, last_name, position_title)
       on public.user_profiles to authenticated;

-- แต่ผู้ดูแลระบบต้องแก้ role/สถานะได้ จึงทำผ่าน RPC แทนการให้สิทธิ์คอลัมน์
create or replace function public.admin_set_user_role(
  p_user_id uuid, p_role_code public.role_code,
  p_is_active boolean, p_department_ids uuid[] default null
) returns void language plpgsql security definer set search_path = '' as $$
declare v_role uuid;
begin
  if not public.is_admin() then
    raise exception 'เฉพาะผู้ดูแลระบบเท่านั้น' using errcode = '42501';
  end if;
  if p_user_id = (select auth.uid()) and p_role_code <> 'admin' then
    raise exception 'ไม่สามารถลดสิทธิ์ของบัญชีตนเองได้ (กันล็อกตัวเองออกจากระบบ)'
      using errcode = '42501';
  end if;

  select id into v_role from public.roles where code = p_role_code;
  update public.user_profiles
     set role_id = v_role,
         is_active = p_is_active,
         activated_at = case when p_is_active and activated_at is null then now()
                             else activated_at end,
         activated_by = case when p_is_active and activated_by is null then (select auth.uid())
                             else activated_by end,
         updated_at = now()
   where id = p_user_id;

  if p_department_ids is not null then
    delete from public.user_department_scopes where user_id = p_user_id;
    insert into public.user_department_scopes (user_id, department_id)
    select p_user_id, unnest(p_department_ids)
    on conflict do nothing;
  end if;
end $$;

create policy scopes_read on public.user_department_scopes
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy scopes_admin on public.user_department_scopes
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy rmp_read on public.role_menu_permissions
  for select to authenticated using ((select public.is_active_user()));
create policy rmp_admin on public.role_menu_permissions
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- ให้ Auth service อ่านโปรไฟล์ได้ (จำเป็นถ้าเปิดใช้ access-token hook ภายหลัง)
grant usage on schema public to supabase_auth_admin;
grant select on public.user_profiles, public.roles,
                public.user_department_scopes to supabase_auth_admin;
create policy auth_admin_read_profiles on public.user_profiles
  for select to supabase_auth_admin using (true);

-- ---------------------------------------------------------------------
-- 4. ข้อมูลหลักที่ผูกกับสาขาวิชา
--    อ่าน: ตามขอบเขตสาขา / เขียน: admin, academic ทุกสาขา, secretary เฉพาะสาขาตน
-- ---------------------------------------------------------------------
create policy courses_read on public.courses
  for select to authenticated
  using ((select public.can_read_department(department_id)));
create policy courses_write on public.courses
  for all to authenticated
  using ((select public.can_write_department(department_id)))
  with check ((select public.can_write_department(department_id)));

create policy offerings_read on public.course_offerings
  for select to authenticated
  using ((select public.can_read_department(department_id)));
create policy offerings_write on public.course_offerings
  for all to authenticated
  using ((select public.can_write_department(department_id)))
  with check ((select public.can_write_department(department_id)));

create policy coordinators_read on public.coordinators
  for select to authenticated
  using ((select public.can_read_department(department_id)));
create policy coordinators_write on public.coordinators
  for all to authenticated
  using ((select public.can_write_department(department_id)))
  with check ((select public.can_write_department(department_id)));

create policy sites_read on public.clinical_sites
  for select to authenticated
  using (department_id is null or (select public.can_read_department(department_id)));
create policy sites_write on public.clinical_sites
  for all to authenticated
  using ((select public.can_write_department(department_id)))
  with check ((select public.can_write_department(department_id)));

-- payees เห็นได้ถ้ามีสาขาที่ผู้ใช้เข้าถึงได้อย่างน้อยหนึ่งสาขา
create policy payees_read on public.payees
  for select to authenticated
  using (
    (select public.sees_all_departments())
    or exists (select 1 from public.payee_departments pd
               where pd.payee_id = payees.id
                 and public.can_read_department(pd.department_id)))
;
create policy payees_write on public.payees
  for all to authenticated
  using ((select public.current_role_code()) in ('admin','academic','secretary'))
  with check ((select public.current_role_code()) in ('admin','academic','secretary'));

-- คอลัมน์ has_bank_account ดูแลโดย trigger เท่านั้น ห้าม client เขียน
revoke update on public.payees from authenticated;
grant  update (payee_kind, prefix, first_name, last_name, position_title,
               organization, ward, phone, email, is_government_officer,
               is_active, note, updated_at)
       on public.payees to authenticated;
revoke update on public.clinical_sites from authenticated;
grant  update (name_th, ward, province, department_id, phone, is_active, updated_at)
       on public.clinical_sites to authenticated;

-- ตารางเชื่อมโยง: ใช้สิทธิ์ตามรายวิชาที่ผูกอยู่
create policy pco_read on public.payee_course_offerings
  for select to authenticated
  using (exists (select 1 from public.course_offerings o
                 where o.id = course_offering_id
                   and (select public.can_read_department(o.department_id))));
create policy pco_write on public.payee_course_offerings
  for all to authenticated
  using (exists (select 1 from public.course_offerings o
                 where o.id = course_offering_id
                   and (select public.can_write_department(o.department_id))))
  with check (exists (select 1 from public.course_offerings o
                 where o.id = course_offering_id
                   and (select public.can_write_department(o.department_id))));

create policy ccs_read on public.course_clinical_sites
  for select to authenticated
  using (exists (select 1 from public.course_offerings o
                 where o.id = course_offering_id
                   and (select public.can_read_department(o.department_id))));
create policy ccs_write on public.course_clinical_sites
  for all to authenticated
  using (exists (select 1 from public.course_offerings o
                 where o.id = course_offering_id
                   and (select public.can_write_department(o.department_id))))
  with check (exists (select 1 from public.course_offerings o
                 where o.id = course_offering_id
                   and (select public.can_write_department(o.department_id))));

create policy cc_read on public.course_coordinators
  for select to authenticated
  using (exists (select 1 from public.course_offerings o
                 where o.id = course_offering_id
                   and (select public.can_read_department(o.department_id))));
create policy cc_write on public.course_coordinators
  for all to authenticated
  using (exists (select 1 from public.course_offerings o
                 where o.id = course_offering_id
                   and (select public.can_write_department(o.department_id))))
  with check (exists (select 1 from public.course_offerings o
                 where o.id = course_offering_id
                   and (select public.can_write_department(o.department_id))));

create policy pd_read on public.payee_departments
  for select to authenticated
  using ((select public.can_read_department(department_id)));
create policy pd_write on public.payee_departments
  for all to authenticated
  using ((select public.can_write_department(department_id)))
  with check ((select public.can_write_department(department_id)));

-- ---------------------------------------------------------------------
-- 5. งบประมาณรายวิชา
-- ---------------------------------------------------------------------
create policy cba_read on public.course_budget_allocations
  for select to authenticated
  using (exists (select 1 from public.course_offerings o
                 where o.id = course_offering_id
                   and (select public.can_read_department(o.department_id))));
create policy cba_write on public.course_budget_allocations
  for all to authenticated
  using (exists (select 1 from public.course_offerings o
                 where o.id = course_offering_id
                   and (select public.can_write_department(o.department_id))))
  with check (exists (select 1 from public.course_offerings o
                 where o.id = course_offering_id
                   and (select public.can_write_department(o.department_id))));

-- ---------------------------------------------------------------------
-- 6. เอกสารการเบิกจ่าย
-- ---------------------------------------------------------------------
create policy voucher_read on public.payment_vouchers
  for select to authenticated
  using (deleted_at is null and (select public.can_read_department(department_id)));

-- ผู้ดูแลระบบยังเห็นเอกสารที่ถูกลบ (ร่องรอยสำหรับการตรวจสอบ)
create policy voucher_read_deleted on public.payment_vouchers
  for select to authenticated using ((select public.is_admin()));

create policy voucher_insert on public.payment_vouchers
  for insert to authenticated
  with check (exists (select 1 from public.course_offerings o
                      where o.id = course_offering_id
                        and (select public.can_write_department(o.department_id))));

-- แก้ไขได้เฉพาะเอกสารที่ยังไม่ผ่านการตรวจสอบ (trigger guard ตรวจซ้ำอีกชั้น)
create policy voucher_update on public.payment_vouchers
  for update to authenticated
  using ((select public.can_write_department(department_id))
         and status in ('draft','submitted') and deleted_at is null)
  with check ((select public.can_write_department(department_id)));

create policy voucher_delete on public.payment_vouchers
  for delete to authenticated
  using ((select public.can_write_department(department_id)) and status = 'draft');

-- เจ้าหน้าที่การเงิน "ไม่ได้" รับสิทธิ์ UPDATE ที่นี่โดยเจตนา
-- การเปลี่ยนสถานะทั้งหมดผ่าน RPC public.set_voucher_status เท่านั้น

create policy vlines_read on public.voucher_lines
  for select to authenticated
  using (exists (select 1 from public.payment_vouchers v
                 where v.id = voucher_id and v.deleted_at is null
                   and (select public.can_read_department(v.department_id))));
create policy vlines_write on public.voucher_lines
  for all to authenticated
  using (exists (select 1 from public.payment_vouchers v
                 where v.id = voucher_id
                   and v.status in ('draft','submitted')
                   and (select public.can_write_department(v.department_id))))
  with check (exists (select 1 from public.payment_vouchers v
                 where v.id = voucher_id
                   and v.status in ('draft','submitted')
                   and (select public.can_write_department(v.department_id))));

create policy vchk_read on public.voucher_checklists
  for select to authenticated
  using (exists (select 1 from public.payment_vouchers v
                 where v.id = voucher_id
                   and (select public.can_read_department(v.department_id))));
create policy vchk_write on public.voucher_checklists
  for all to authenticated
  using (exists (select 1 from public.payment_vouchers v
                 where v.id = voucher_id
                   and v.status in ('draft','submitted')
                   and (select public.can_write_department(v.department_id))))
  with check (exists (select 1 from public.payment_vouchers v
                 where v.id = voucher_id
                   and v.status in ('draft','submitted')
                   and (select public.can_write_department(v.department_id))));

-- ---------------------------------------------------------------------
-- 7. หน้างบใบสำคัญฯ — ผู้รับผิดชอบการเบิกจ่าย (admin) เป็นผู้จัดทำ
-- ---------------------------------------------------------------------
create policy cover_read on public.treasury_cover_sheets
  for select to authenticated
  using (deleted_at is null and (select public.is_active_user()));
create policy cover_write on public.treasury_cover_sheets
  for all to authenticated
  using ((select public.current_role_code()) in ('admin','finance')
         and status in ('draft','submitted'))
  with check ((select public.current_role_code()) in ('admin','finance'));

create policy cover_items_read on public.treasury_cover_sheet_items
  for select to authenticated using ((select public.is_active_user()));
create policy cover_items_write on public.treasury_cover_sheet_items
  for all to authenticated
  using (exists (select 1 from public.treasury_cover_sheets s
                 where s.id = sheet_id and s.status in ('draft','submitted')
                   and (select public.current_role_code()) in ('admin','finance')))
  with check (exists (select 1 from public.treasury_cover_sheets s
                 where s.id = sheet_id and s.status in ('draft','submitted')
                   and (select public.current_role_code()) in ('admin','finance')));

-- ---------------------------------------------------------------------
-- 8. สิทธิ์เรียกใช้ฟังก์ชัน
-- ---------------------------------------------------------------------
revoke execute on all functions in schema public from anon, public;

grant execute on function
  public.set_voucher_status(uuid, public.voucher_status, date, text, text),
  public.get_bank_account(public.bank_owner_type, uuid, text),
  public.upsert_bank_account(public.bank_owner_type, uuid, text, text, text),
  public.admin_set_user_role(uuid, public.role_code, boolean, uuid[]),
  public.current_role_code(), public.current_department_ids(),
  public.sees_all_departments(), public.can_read_department(uuid),
  public.can_write_department(uuid), public.is_admin(), public.is_active_user(),
  public.fiscal_year_be(date), public.today_bkk()
to authenticated;

-- ฟังก์ชันที่ต้องเรียกจาก trigger เท่านั้น ไม่เปิดให้ client
revoke execute on function public.next_voucher_no(uuid) from authenticated, anon, public;

-- ---------------------------------------------------------------------
-- 9. ผู้ดูแลระบบอ่าน audit ได้ผ่าน RPC (ไม่เปิด schema audit ให้ API)
-- ---------------------------------------------------------------------
create or replace function public.read_audit_log(
  p_table text default null, p_record_id text default null,
  p_from timestamptz default null, p_to timestamptz default null,
  p_limit int default 200, p_offset int default 0
) returns setof audit.activity_log
language plpgsql security definer set search_path = '' as $$
begin
  if public.current_role_code() not in ('admin','executive') then
    raise exception 'ไม่มีสิทธิ์อ่านร่องรอยการใช้งาน' using errcode = '42501';
  end if;
  return query
  select * from audit.activity_log a
  where (p_table is null or a.table_name = p_table)
    and (p_record_id is null or a.record_id = p_record_id)
    and (p_from is null or a.occurred_at >= p_from)
    and (p_to   is null or a.occurred_at <  p_to)
  order by a.occurred_at desc
  limit least(coalesce(p_limit, 200), 1000) offset coalesce(p_offset, 0);
end $$;

grant execute on function
  public.read_audit_log(text, text, timestamptz, timestamptz, int, int)
to authenticated;
