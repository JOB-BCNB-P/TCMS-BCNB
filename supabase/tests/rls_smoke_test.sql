-- =====================================================================
-- TCMS-BCNB : ชุดทดสอบความปลอดภัย (smoke test)
-- รันบนฐานข้อมูลทดสอบเท่านั้น — ห้ามรันบน production
--   psql -f supabase/tests/rls_smoke_test.sql
-- ทุกข้อที่ขึ้น FAIL คือช่องโหว่ ไม่ใช่แค่เทสต์ตก
-- =====================================================================
\set ON_ERROR_STOP off
\timing off

-- ---------------------------------------------------------------------
-- เตรียมข้อมูลทดสอบ (รันในสิทธิ์เจ้าของฐานข้อมูล)
-- ---------------------------------------------------------------------
do $$
declare
  v_admin uuid; v_sec1 uuid; v_sec2 uuid; v_fin uuid; v_ins uuid; v_pending uuid;
  v_ped uuid; v_adu uuid; v_mat uuid; v_psy uuid; v_com uuid;
  v_course_ped uuid; v_course_adu uuid;
  v_off_ped uuid; v_off_adu uuid;
  v_ay uuid; v_sem uuid; v_fy uuid; v_cat uuid; v_payee uuid;
begin
  -- ผู้ใช้
  insert into auth.users (email) values
    ('admin.test@bcn.ac.th'), ('sec1.test@bcn.ac.th'), ('sec2.test@bcn.ac.th'),
    ('fin.test@bcn.ac.th'),   ('ins.test@bcn.ac.th'),  ('pending.test@bcn.ac.th');

  select id into v_admin   from auth.users where email = 'admin.test@bcn.ac.th';
  select id into v_sec1    from auth.users where email = 'sec1.test@bcn.ac.th';
  select id into v_sec2    from auth.users where email = 'sec2.test@bcn.ac.th';
  select id into v_fin     from auth.users where email = 'fin.test@bcn.ac.th';
  select id into v_ins     from auth.users where email = 'ins.test@bcn.ac.th';
  select id into v_pending from auth.users where email = 'pending.test@bcn.ac.th';

  select id into v_ped from public.departments where code = 'PED';
  select id into v_mat from public.departments where code = 'MAT';
  select id into v_psy from public.departments where code = 'PSY';
  select id into v_adu from public.departments where code = 'ADU';
  select id into v_com from public.departments where code = 'COM';

  update public.user_profiles set is_active = true,
         role_id = (select id from public.roles where code = 'admin')      where id = v_admin;
  update public.user_profiles set is_active = true,
         role_id = (select id from public.roles where code = 'secretary')  where id in (v_sec1, v_sec2);
  update public.user_profiles set is_active = true,
         role_id = (select id from public.roles where code = 'finance')    where id = v_fin;
  update public.user_profiles set is_active = true,
         role_id = (select id from public.roles where code = 'instructor') where id = v_ins;
  -- v_pending คงค่า is_active = false ตามค่าตั้งต้น

  insert into public.user_department_scopes (user_id, department_id) values
    (v_sec1, v_ped), (v_sec1, v_mat), (v_sec1, v_psy),
    (v_sec2, v_adu), (v_sec2, v_com),
    (v_ins,  v_ped);

  -- ข้อมูลอ้างอิง
  select id into v_ay  from public.academic_years where year_be = 2569;
  select id into v_fy  from public.fiscal_years   where year_be = 2569;
  insert into public.semesters (academic_year_id, code, name_th, start_date, end_date)
  values (v_ay, 'first', 'ภาคการศึกษาที่ 1', '2026-06-01', '2026-10-15')
  returning id into v_sem;
  select id into v_cat from public.budget_categories where code = 'GEN_THEORY';

  -- รายวิชาคนละสาขา
  insert into public.courses (code, name_th, course_kind, department_id)
  values ('PED101', 'การพยาบาลเด็ก 1', 'theory', v_ped) returning id into v_course_ped;
  insert into public.courses (code, name_th, course_kind, department_id)
  values ('ADU101', 'การพยาบาลผู้ใหญ่ 1', 'theory', v_adu) returning id into v_course_adu;

  insert into public.course_offerings
    (course_id, academic_year_id, semester_id, fiscal_year_id, department_id, student_year_level)
  values (v_course_ped, v_ay, v_sem, v_fy, v_ped, 2) returning id into v_off_ped;
  insert into public.course_offerings
    (course_id, academic_year_id, semester_id, fiscal_year_id, department_id, student_year_level)
  values (v_course_adu, v_ay, v_sem, v_fy, v_adu, 3) returning id into v_off_adu;

  -- วงเงิน 10,000 บาท ให้วิชาของสาขาเด็ก
  insert into public.course_budget_allocations (course_offering_id, budget_category_id, allocated_amount)
  values (v_off_ped, v_cat, 10000.00);

  -- ผู้รับเงินและเลขบัญชี
  insert into public.payees (payee_kind, prefix, first_name, last_name, position_title,
                             is_government_officer)
  values ('special_lecturer', 'นาง', 'ทดสอบ', 'ระบบ', 'พยาบาลวิชาชีพชำนาญการ', true)
  returning id into v_payee;
  insert into public.payee_departments (payee_id, department_id) values (v_payee, v_ped);
  insert into private.bank_accounts (owner_type, owner_id, bank_code, account_no, account_name)
  values ('payee', v_payee, 'KTB', '1234567890', 'ทดสอบ ระบบ');
end $$;

-- ---------------------------------------------------------------------
-- ฟังก์ชันช่วยรายงานผล
-- ---------------------------------------------------------------------
create or replace function pg_temp.check(p_name text, p_ok boolean)
returns void language plpgsql as $$
begin
  raise notice '% : %', case when p_ok then 'PASS' else '*** FAIL ***' end, p_name;
end $$;

create or replace function pg_temp.as_user(p_email text) returns void
language plpgsql as $$
declare v uuid;
begin
  select id into v from auth.users where email = p_email;
  perform set_config('request.jwt.claim.sub', v::text, false);
end $$;

-- =====================================================================
-- การทดสอบ
-- =====================================================================
do $$
declare n int; ok boolean; v_off_ped uuid; v_off_adu uuid; v_payee uuid;
        v_cat uuid; v_voucher uuid;
begin
  select o.id into v_off_ped from public.course_offerings o
    join public.courses c on c.id = o.course_id where c.code = 'PED101';
  select o.id into v_off_adu from public.course_offerings o
    join public.courses c on c.id = o.course_id where c.code = 'ADU101';
  select id into v_payee from public.payees where first_name = 'ทดสอบ';
  select id into v_cat   from public.budget_categories where code = 'GEN_THEORY';

  -- 1. เลขานุการคนที่ 1 เห็นเฉพาะสาขาของตน --------------------------------
  perform pg_temp.as_user('sec1.test@bcn.ac.th');
  set local role authenticated;
  select count(*) into n from public.course_offerings where id = v_off_ped;
  perform pg_temp.check('1a เลขานุการ 1 อ่านรายวิชาสาขาเด็กได้', n = 1);
  select count(*) into n from public.course_offerings where id = v_off_adu;
  perform pg_temp.check('1b เลขานุการ 1 อ่านรายวิชาสาขาผู้ใหญ่ไม่ได้', n = 0);
  reset role;

  -- 2. เลขานุการคนที่ 2 กลับกัน --------------------------------------------
  perform pg_temp.as_user('sec2.test@bcn.ac.th');
  set local role authenticated;
  select count(*) into n from public.course_offerings where id = v_off_adu;
  perform pg_temp.check('2a เลขานุการ 2 อ่านรายวิชาสาขาผู้ใหญ่ได้', n = 1);
  select count(*) into n from public.course_offerings where id = v_off_ped;
  perform pg_temp.check('2b เลขานุการ 2 อ่านรายวิชาสาขาเด็กไม่ได้', n = 0);
  reset role;

  -- 3. ผู้ใช้ที่ยังไม่เปิดใช้งาน เห็น 0 แถว ---------------------------------
  perform pg_temp.as_user('pending.test@bcn.ac.th');
  set local role authenticated;
  select count(*) into n from public.departments;
  perform pg_temp.check('3 ผู้ใช้ที่ยังไม่อนุมัติอ่านตารางอ้างอิงได้ 0 แถว', n = 0);
  reset role;

  -- 4. อาจารย์สร้างใบหลักฐานไม่ได้ ------------------------------------------
  perform pg_temp.as_user('ins.test@bcn.ac.th');
  set local role authenticated;
  begin
    insert into public.payment_vouchers (voucher_kind, course_offering_id, department_id, fiscal_year_id)
    select 'lecturer', v_off_ped, o.department_id, o.fiscal_year_id
    from public.course_offerings o where o.id = v_off_ped;
    ok := false;
  exception when others then ok := true;
  end;
  perform pg_temp.check('4 อาจารย์สร้างใบหลักฐานไม่ได้', ok);
  reset role;

  -- 5. บทบาทที่ไม่ใช่ admin/finance อ่านเลขบัญชีไม่ได้ ----------------------
  perform pg_temp.as_user('sec1.test@bcn.ac.th');
  set local role authenticated;
  begin
    perform public.get_bank_account('payee', v_payee, 'ทดสอบการเข้าถึง');
    ok := false;
  exception when others then ok := true;
  end;
  perform pg_temp.check('5a เลขานุการเรียกดูเลขบัญชีไม่ได้', ok);
  -- แต่ยังเห็นจุดสีเขียว
  select count(*) into n from public.payees where id = v_payee and has_bank_account;
  perform pg_temp.check('5b เลขานุการเห็นสถานะว่ามีเลขบัญชีแล้ว (จุดเขียว)', n = 1);
  reset role;

  -- 6. การเงินอ่านเลขบัญชีได้ และถูกบันทึก audit ----------------------------
  perform pg_temp.as_user('fin.test@bcn.ac.th');
  set local role authenticated;
  perform public.get_bank_account('payee', v_payee, 'ตรวจสอบก่อนโอนเงินเดือนกันยายน');
  reset role;
  select count(*) into n from audit.sensitive_access_log
   where owner_id = v_payee and operation = 'READ';
  perform pg_temp.check('6 การเงินอ่านเลขบัญชีได้ และมีร่องรอยใน audit', n = 1);

  -- 7. เข้าถึงตาราง private โดยตรงไม่ได้ ------------------------------------
  perform pg_temp.as_user('admin.test@bcn.ac.th');
  set local role authenticated;
  begin
    select count(*) into n from private.bank_accounts;
    ok := false;
  exception when others then ok := true;
  end;
  perform pg_temp.check('7 แม้แต่ผู้ดูแลระบบก็ query ตาราง private ตรง ๆ ไม่ได้', ok);
  reset role;

  -- 8. กันเบิกเกินวงเงิน (วงเงิน 10,000) ------------------------------------
  perform pg_temp.as_user('sec1.test@bcn.ac.th');
  set local role authenticated;
  insert into public.payment_vouchers (voucher_kind, course_offering_id, department_id, fiscal_year_id)
  select 'lecturer', v_off_ped, o.department_id, o.fiscal_year_id
  from public.course_offerings o where o.id = v_off_ped
  returning id into v_voucher;

  insert into public.voucher_lines (voucher_id, line_no, payee_id, budget_category_id,
                                    expense_item, hours, rate, amount)
  values (v_voucher, 1, v_payee, v_cat, 'theory', 10, 400, 4000);
  perform pg_temp.check('8a บันทึกรายการในวงเงินได้', true);

  begin
    insert into public.voucher_lines (voucher_id, line_no, payee_id, budget_category_id,
                                      expense_item, hours, rate, amount)
    values (v_voucher, 2, v_payee, v_cat, 'theory', 20, 400, 8000);
    ok := false;
  exception when others then ok := true;
  end;
  perform pg_temp.check('8b บันทึกรายการที่ทำให้เกินวงเงินถูกปฏิเสธ', ok);

  select total_amount into n from public.payment_vouchers where id = v_voucher;
  perform pg_temp.check('8c ยอดรวมถูกคำนวณอัตโนมัติเป็น 4,000', n = 4000);
  reset role;

  -- 9. ส่งเอกสารโดยยังไม่ติ๊กเช็คลิสต์ไม่ได้ ---------------------------------
  perform pg_temp.as_user('sec1.test@bcn.ac.th');
  set local role authenticated;
  insert into public.voucher_checklists (voucher_id, item_key)
  select v_voucher, key from public.checklist_items;
  begin
    perform public.set_voucher_status(v_voucher, 'submitted');
    ok := false;
  exception when others then ok := true;
  end;
  perform pg_temp.check('9a ส่งเอกสารโดยเช็คลิสต์ไม่ครบไม่ได้', ok);

  update public.voucher_checklists set is_checked = true where voucher_id = v_voucher;
  perform public.set_voucher_status(v_voucher, 'submitted');
  select count(*) into n from public.payment_vouchers
   where id = v_voucher and status = 'submitted' and voucher_no is not null;
  perform pg_temp.check('9b ติ๊กครบแล้วส่งได้ และได้เลขที่ใบสำคัญ', n = 1);
  reset role;

  -- 10. เลขานุการเปลี่ยนสถานะเป็นตรวจสอบแล้วเองไม่ได้ ------------------------
  perform pg_temp.as_user('sec1.test@bcn.ac.th');
  set local role authenticated;
  begin
    perform public.set_voucher_status(v_voucher, 'verified');
    ok := false;
  exception when others then ok := true;
  end;
  perform pg_temp.check('10 เลขานุการอนุมัติสถานะตรวจสอบแล้วเองไม่ได้', ok);
  reset role;

  -- 11. การเงินแก้ยอดเงินไม่ได้ ---------------------------------------------
  perform pg_temp.as_user('fin.test@bcn.ac.th');
  set local role authenticated;
  begin
    update public.payment_vouchers set total_amount = 1 where id = v_voucher;
    get diagnostics n = row_count;
    ok := (n = 0);          -- RLS ตัดแถวออก จึงไม่มีแถวถูกแก้
  exception when others then ok := true;
  end;
  perform pg_temp.check('11 เจ้าหน้าที่การเงินแก้ยอดเงินในใบหลักฐานไม่ได้', ok);

  -- 12. การเงินเปลี่ยนสถานะผ่าน RPC ได้ -------------------------------------
  perform public.set_voucher_status(v_voucher, 'verified');
  perform public.set_voucher_status(v_voucher, 'paid', current_date, 'KTB');
  reset role;
  select count(*) into n from public.payment_vouchers
   where id = v_voucher and status = 'paid' and payment_date is not null;
  perform pg_temp.check('12 การเงินเปลี่ยนสถานะเป็นจ่ายเงินแล้วผ่าน RPC ได้', n = 1);

  -- 13. เอกสารที่จ่ายเงินแล้วแก้ไม่ได้ ---------------------------------------
  perform pg_temp.as_user('admin.test@bcn.ac.th');
  set local role authenticated;
  begin
    update public.voucher_lines set amount = 99999 where voucher_id = v_voucher;
    get diagnostics n = row_count;
    ok := (n = 0);
  exception when others then ok := true;
  end;
  perform pg_temp.check('13a แม้ผู้ดูแลระบบก็แก้รายการของเอกสารที่จ่ายแล้วไม่ได้', ok);
  begin
    delete from public.payment_vouchers where id = v_voucher;
    get diagnostics n = row_count;
    ok := (n = 0);
  exception when others then ok := true;
  end;
  perform pg_temp.check('13b ลบเอกสารที่จ่ายเงินแล้วไม่ได้', ok);
  reset role;

  -- 14. ลบร่องรอย audit ไม่ได้ ----------------------------------------------
  begin
    delete from audit.activity_log where true;
    ok := false;
  exception when others then ok := true;
  end;
  perform pg_temp.check('14 ลบ audit log ไม่ได้แม้ในสิทธิ์เจ้าของฐานข้อมูล', ok);

  -- 15. บัญชีนอกโดเมนสมัครไม่ได้ --------------------------------------------
  begin
    insert into auth.users (email) values ('somebody@gmail.com');
    ok := false;
  exception when others then ok := true;
  end;
  perform pg_temp.check('15 บัญชีที่ไม่ใช่ @bcn.ac.th สมัครเข้าระบบไม่ได้', ok);

  -- 16. ผู้ดูแลระบบลดสิทธิ์ตัวเองไม่ได้ ---------------------------------------
  perform pg_temp.as_user('admin.test@bcn.ac.th');
  set local role authenticated;
  begin
    perform public.admin_set_user_role(
      (select id from auth.users where email = 'admin.test@bcn.ac.th'),
      'instructor', true, null);
    ok := false;
  exception when others then ok := true;
  end;
  perform pg_temp.check('16 ผู้ดูแลระบบลดสิทธิ์บัญชีตนเองไม่ได้', ok);
  reset role;
end $$;

-- =====================================================================
-- การทดสอบการแบ่งแยกหน้าที่ (migration 0007)
-- =====================================================================
do $$
declare ok boolean; n int; v_off_ped uuid; v_payee uuid; v_cat uuid;
        v_v2 uuid; v_sheet uuid;
begin
  select o.id into v_off_ped from public.course_offerings o
    join public.courses c on c.id = o.course_id where c.code = 'PED101';
  select id into v_payee from public.payees where first_name = 'ทดสอบ';
  select id into v_cat   from public.budget_categories where code = 'GEN_THEORY';

  -- 17. ผู้จัดทำตรวจสอบเอกสารของตัวเองไม่ได้ ---------------------------------
  perform pg_temp.as_user('admin.test@bcn.ac.th');
  set local role authenticated;
  insert into public.payment_vouchers (voucher_kind, course_offering_id, department_id, fiscal_year_id)
  select 'lecturer', v_off_ped, o.department_id, o.fiscal_year_id
  from public.course_offerings o where o.id = v_off_ped
  returning id into v_v2;

  insert into public.voucher_lines (voucher_id, line_no, payee_id, budget_category_id,
                                    expense_item, hours, rate, amount)
  values (v_v2, 1, v_payee, v_cat, 'theory', 5, 400, 2000);
  insert into public.voucher_checklists (voucher_id, item_key, is_checked)
  select v_v2, key, true from public.checklist_items;

  perform public.set_voucher_status(v_v2, 'submitted');
  begin
    perform public.set_voucher_status(v_v2, 'verified');
    ok := false;
  exception when others then ok := true;
  end;
  perform pg_temp.check('17 ผู้จัดทำเอกสารตรวจสอบเอกสารของตนเองไม่ได้', ok);
  reset role;

  -- 18. เจ้าหน้าที่คนอื่นตรวจสอบได้ ------------------------------------------
  perform pg_temp.as_user('fin.test@bcn.ac.th');
  set local role authenticated;
  perform public.set_voucher_status(v_v2, 'verified');
  reset role;
  select count(*) into n from public.payment_vouchers where id = v_v2 and status = 'verified';
  perform pg_temp.check('18 เจ้าหน้าที่การเงิน (คนละคนกับผู้จัดทำ) ตรวจสอบได้', n = 1);

  -- 19. เปิดสวิตช์ผู้ตรวจสอบ ≠ ผู้จ่ายเงิน แล้วต้องถูกปฏิเสธ -------------------
  update public.app_settings set value = 'true'::jsonb
   where key = 'control.enforce_checker_payer';
  perform pg_temp.as_user('fin.test@bcn.ac.th');
  set local role authenticated;
  begin
    perform public.set_voucher_status(v_v2, 'paid', current_date, 'KTB');
    ok := false;
  exception when others then ok := true;
  end;
  perform pg_temp.check('19 เมื่อเปิดสวิตช์ ผู้ตรวจสอบจ่ายเงินเองไม่ได้', ok);
  reset role;

  -- 20. ปิดสวิตช์กลับ แล้วจ่ายเงินได้ ------------------------------------------
  update public.app_settings set value = 'false'::jsonb
   where key = 'control.enforce_checker_payer';
  perform pg_temp.as_user('fin.test@bcn.ac.th');
  set local role authenticated;
  perform public.set_voucher_status(v_v2, 'paid', current_date, 'KTB');
  reset role;
  select count(*) into n from public.payment_vouchers where id = v_v2 and status = 'paid';
  perform pg_temp.check('20 ปิดสวิตช์แล้วเจ้าหน้าที่การเงินคนเดิมจ่ายเงินได้', n = 1);

  -- 21. ผู้จัดทำใบสำคัญ นำใบของตัวเองขึ้นหน้างบที่ตัวเองทำไม่ได้ ----------------
  perform pg_temp.as_user('admin.test@bcn.ac.th');
  set local role authenticated;
  insert into public.treasury_cover_sheets
    (fiscal_year_id, teacher_type, study_level, period_month, created_by)
  select v.fiscal_year_id, 'special', 'bachelor', date_trunc('month', current_date)::date,
         (select auth.uid())
  from public.payment_vouchers v where v.id = v_v2
  returning id into v_sheet;

  begin
    insert into public.treasury_cover_sheet_items
      (sheet_id, voucher_id, line_no, teacher_name, subject_text, amount, subtotal)
    values (v_sheet, v_v2, 1, 'ทดสอบ ระบบ', 'PED101', 2000, 2000);
    ok := false;
  exception when others then ok := true;
  end;
  perform pg_temp.check('21 ผู้จัดทำใบสำคัญนำใบของตนขึ้นหน้างบที่ตนทำเองไม่ได้', ok);
  reset role;

  -- 22. มุมมองสอบทานการควบคุมภายในใช้งานได้ ---------------------------------
  perform pg_temp.as_user('admin.test@bcn.ac.th');
  set local role authenticated;
  select count(*) into n from public.v_voucher_control_trail where voucher_id = v_v2;
  perform pg_temp.check('22 มุมมอง v_voucher_control_trail อ่านได้', n = 1);
  reset role;
end $$;

-- =====================================================================
-- การทดสอบอัตราค่าตอบแทน (migration 0008-0009)
-- =====================================================================
do $$
declare ok boolean; n int; v_off uuid; v_payee uuid; v_gen_theory uuid;
        v_rev_site uuid; v_v uuid; v_amt numeric; v_rate numeric;
        v_payee_ext uuid; v_ped uuid;
begin
  select o.id into v_off from public.course_offerings o
    join public.courses c on c.id = o.course_id where c.code = 'PED101';
  select id into v_payee from public.payees where first_name = 'ทดสอบ';
  select id into v_ped   from public.departments where code = 'PED';
  select id into v_gen_theory from public.budget_categories where code = 'GEN_THEORY';
  select id into v_rev_site   from public.budget_categories where code = 'REV_SITE';

  -- ผู้สอนที่ไม่ใช่ข้าราชการ ใช้อัตรา 800
  insert into public.payees (payee_kind, prefix, first_name, last_name, is_government_officer)
  values ('special_lecturer', 'นาย', 'ภายนอก', 'ทดสอบ', false) returning id into v_payee_ext;
  insert into public.payee_departments (payee_id, department_id) values (v_payee_ext, v_ped);

  insert into public.course_budget_allocations (course_offering_id, budget_category_id, allocated_amount)
  values (v_off, v_rev_site, 5000) on conflict do nothing;

  perform pg_temp.as_user('sec1.test@bcn.ac.th');
  set local role authenticated;
  insert into public.payment_vouchers (voucher_kind, course_offering_id, department_id, fiscal_year_id)
  select 'lecturer', v_off, o.department_id, o.fiscal_year_id
  from public.course_offerings o where o.id = v_off returning id into v_v;

  -- 23. เติมอัตราและคำนวณเงินให้อัตโนมัติ (ข้าราชการ ทฤษฎี เงินอุดหนุน = 400) ----
  insert into public.voucher_lines (voucher_id, line_no, payee_id, budget_category_id,
                                    expense_item, hours)
  values (v_v, 1, v_payee, v_gen_theory, 'theory', 3);
  select rate, amount into v_rate, v_amt from public.voucher_lines
   where voucher_id = v_v and line_no = 1;
  perform pg_temp.check('23 เติมอัตรา 400 และคำนวณเงิน 1,200 ให้อัตโนมัติ',
                        v_rate = 400 and v_amt = 1200);

  -- 24. อัตราตายตัว แก้เป็นค่าอื่นไม่ได้ ---------------------------------------
  begin
    insert into public.voucher_lines (voucher_id, line_no, payee_id, budget_category_id,
                                      expense_item, hours, rate, amount)
    values (v_v, 2, v_payee, v_gen_theory, 'theory', 2, 500, 1000);
    ok := false;
  exception when others then ok := true;
  end;
  perform pg_temp.check('24 กรอกอัตรา 500 ทั้งที่หลักเกณฑ์กำหนด 400 ถูกปฏิเสธ', ok);

  -- 25. ผู้สอนที่มิได้เป็นข้าราชการ ใช้อัตรา 800 -------------------------------
  insert into public.voucher_lines (voucher_id, line_no, payee_id, budget_category_id,
                                    expense_item, hours)
  values (v_v, 3, v_payee_ext, v_gen_theory, 'theory', 1);
  select rate into v_rate from public.voucher_lines where voucher_id = v_v and line_no = 3;
  perform pg_temp.check('25 ผู้สอนที่มิได้เป็นข้าราชการได้อัตรา 800', v_rate = 800);

  -- 26. รายการไม่ตรงกับหมวดเงินที่เลือก --------------------------------------
  begin
    insert into public.voucher_lines (voucher_id, line_no, payee_id, budget_category_id,
                                      expense_item, hours, amount)
    values (v_v, 4, v_payee, v_gen_theory, 'lab', 1, 200);
    ok := false;
  exception when others then ok := true;
  end;
  perform pg_temp.check('26 รายการที่ไม่ตรงกับหมวดเงินถูกปฏิเสธ', ok);

  -- 27. เพดานแบบ "ไม่เกิน" ยอมให้ต่ำกว่าได้ แต่ไม่ให้เกิน ----------------------
  insert into public.voucher_lines (voucher_id, line_no, clinical_site_id, budget_category_id,
                                    expense_item, quantity, rate)
  select v_v, 5, cs.id, v_rev_site, 'site_compensation', 10, 80
  from public.clinical_sites cs limit 1;
  get diagnostics n = row_count;
  if n = 0 then
    -- ยังไม่มีแหล่งฝึกในชุดทดสอบ สร้างก่อน
    reset role;
    insert into public.clinical_sites (name_th, ward, department_id)
    values ('โรงพยาบาลทดสอบ', 'อายุรกรรม', v_ped);
    perform pg_temp.as_user('sec1.test@bcn.ac.th');
    set local role authenticated;
    insert into public.voucher_lines (voucher_id, line_no, clinical_site_id, budget_category_id,
                                      expense_item, quantity, rate)
    select v_v, 5, cs.id, v_rev_site, 'site_compensation', 10, 80
    from public.clinical_sites cs where cs.name_th = 'โรงพยาบาลทดสอบ';
  end if;
  select amount into v_amt from public.voucher_lines where voucher_id = v_v and line_no = 5;
  perform pg_temp.check('27a ค่าตอบแทนแหล่งฝึก 10 คน × 80 บาท = 800 (ต่ำกว่าเพดาน 100)', v_amt = 800);

  begin
    insert into public.voucher_lines (voucher_id, line_no, clinical_site_id, budget_category_id,
                                      expense_item, quantity, rate)
    select v_v, 6, cs.id, v_rev_site, 'site_compensation', 5, 150
    from public.clinical_sites cs where cs.name_th = 'โรงพยาบาลทดสอบ';
    ok := false;
  exception when others then ok := true;
  end;
  perform pg_temp.check('27b อัตรา 150 บาท/คน/เดือน เกินเพดาน 100 ถูกปฏิเสธ', ok);

  -- 28. จำนวนเงินที่กรอกไม่ตรงกับ หน่วย × อัตรา ------------------------------
  begin
    insert into public.voucher_lines (voucher_id, line_no, payee_id, budget_category_id,
                                      expense_item, hours, rate, amount)
    values (v_v, 7, v_payee, v_gen_theory, 'theory', 2, 400, 9999);
    ok := false;
  exception when others then ok := true;
  end;
  perform pg_temp.check('28 จำนวนเงินไม่ตรงกับ ชั่วโมง × อัตรา ถูกปฏิเสธ', ok);
  reset role;

  -- 29. ผู้ดูแลระบบแก้อัตราได้ บทบาทอื่นแก้ไม่ได้ ------------------------------
  perform pg_temp.as_user('fin.test@bcn.ac.th');
  set local role authenticated;
  begin
    update public.pay_rates set amount = 9999
     where fund_source = 'general_subsidy' and expense_item = 'theory';
    get diagnostics n = row_count;
    ok := (n = 0);
  exception when others then ok := true;
  end;
  perform pg_temp.check('29 เจ้าหน้าที่การเงินแก้ตารางอัตราไม่ได้', ok);
  reset role;
end $$;

-- =====================================================================
-- การทดสอบการมองเห็นผู้รับเงินที่เพิ่งสร้าง (migration 0010)
-- จำลองลำดับที่หน้าเว็บทำจริง: insert แล้วอ่านกลับทันที ก่อนผูกสาขาวิชา
-- =====================================================================
do $$
declare n int; ok boolean; v_new uuid; v_adu uuid; v_other uuid;
begin
  select id into v_adu from public.departments where code = 'ADU';

  -- 30. เลขานุการเพิ่มผู้รับเงินใหม่ แล้วอ่านกลับได้ทันที -----------------------
  perform pg_temp.as_user('sec1.test@bcn.ac.th');
  set local role authenticated;
  insert into public.payees (payee_kind, first_name, last_name)
  values ('special_lecturer', 'เพิ่งสร้าง', 'ยังไม่ผูกสาขา')
  returning id into v_new;
  select count(*) into n from public.payees where id = v_new;
  perform pg_temp.check('30 เพิ่มผู้รับเงินแล้วอ่านกลับได้ทันทีก่อนผูกสาขา', n = 1);

  -- ผูกสาขาให้เป็นของอีกสาขาหนึ่งที่เลขานุการคนนี้ไม่ได้ดูแล
  reset role;
  insert into public.payee_departments (payee_id, department_id) values (v_new, v_adu);

  -- 31. พอผูกเป็นสาขาอื่นแล้ว ต้องมองไม่เห็นอีก ------------------------------
  perform pg_temp.as_user('sec1.test@bcn.ac.th');
  set local role authenticated;
  select count(*) into n from public.payees where id = v_new;
  perform pg_temp.check('31 ผูกเป็นสาขาอื่นแล้ว เลขานุการคนนี้มองไม่เห็น', n = 0);
  reset role;

  -- 32. อาจารย์ (อ่านอย่างเดียว) ไม่เห็นผู้รับเงินที่ยังไม่ผูกสาขา ---------------
  reset role;
  insert into public.payees (payee_kind, first_name, last_name)
  values ('preceptor', 'ไม่ผูก', 'สาขา2') returning id into v_other;
  perform pg_temp.as_user('ins.test@bcn.ac.th');
  set local role authenticated;
  select count(*) into n from public.payees where id = v_other;
  perform pg_temp.check('32 อาจารย์ไม่เห็นผู้รับเงินที่ยังไม่ผูกสาขา', n = 0);

  -- 33. อาจารย์เพิ่มผู้รับเงินไม่ได้ ------------------------------------------
  begin
    insert into public.payees (payee_kind, first_name, last_name)
    values ('special_lecturer', 'ห้าม', 'เพิ่ม');
    ok := false;
  exception when others then ok := true;
  end;
  perform pg_temp.check('33 อาจารย์เพิ่มผู้รับเงินไม่ได้', ok);
  reset role;
end $$;
