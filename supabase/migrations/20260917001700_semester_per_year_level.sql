-- =====================================================================
-- 0017 ภาคการศึกษาแยกตามชั้นปี + ผู้ลงนามในแบบฟอร์ม
--
-- แต่ละชั้นปีเปิด-ปิดภาคการศึกษาไม่พร้อมกัน (ชั้นปี 4 ออกฝึกก่อน ชั้นปี 1 เข้าทีหลัง)
-- เดิมตาราง semesters มีข้อจำกัด unique (academic_year_id, code) จึงมีได้
-- "ภาค 1 ของปี 2569" เพียงรายการเดียว ซึ่งบังคับให้ทุกชั้นปีใช้ช่วงวันเดียวกัน
--
-- เพิ่ม student_year_level โดยให้ NULL = ใช้กับทุกชั้นปี (ข้อมูลเดิมยังใช้ได้)
-- =====================================================================

alter table public.semesters
  add column if not exists student_year_level smallint
    check (student_year_level is null or student_year_level between 1 and 4);

comment on column public.semesters.student_year_level is
  'NULL = ใช้กับทุกชั้นปี · 1-4 = ภาคการศึกษาเฉพาะชั้นปีนั้น (แต่ละชั้นปีเปิด-ปิดไม่พร้อมกัน)';

-- ข้อจำกัดเดิมกันไม่ให้มีภาคเดียวกันซ้ำในปีเดียวกัน ต้องเปลี่ยนให้นับชั้นปีด้วย
alter table public.semesters drop constraint if exists semesters_academic_year_id_code_key;

-- coalesce เพราะ NULL ไม่ชนกันเองใน unique index ปกติ
-- ถ้าไม่ครอบ จะเพิ่ม "ภาค 1 ทุกชั้นปี" ซ้ำได้หลายแถวโดยไม่มีอะไรห้าม
create unique index if not exists semesters_year_code_level_key
  on public.semesters (academic_year_id, code, coalesce(student_year_level, 0));

-- ---------------------------------------------------------------------
-- รายวิชาที่เปิดสอนต้องเลือกภาคที่ตรงกับชั้นปีของตน
--
-- ถ้าไม่ตรวจ จะเลือก "ภาค 1 ของชั้นปี 4" มาใส่ให้รายวิชาชั้นปี 1 ได้
-- แล้วช่วงวันที่บนเอกสารกับชั้นปีที่สอนจะขัดกันเอง โดยไม่มีใครเห็น
-- ---------------------------------------------------------------------
create or replace function public.sync_offering_keys()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_dept uuid; v_year uuid; v_level smallint; v_sem text;
begin
  select department_id into v_dept from public.courses where id = new.course_id;
  new.department_id := v_dept;

  select academic_year_id, student_year_level, name_th
    into v_year, v_level, v_sem
  from public.semesters where id = new.semester_id;

  if v_year is distinct from new.academic_year_id then
    raise exception 'ภาคการศึกษาที่เลือกไม่อยู่ในปีการศึกษาที่ระบุ' using errcode = '23514';
  end if;

  if v_level is not null and v_level is distinct from new.student_year_level then
    raise exception
      'ภาคการศึกษา "%" เป็นของชั้นปี % แต่รายวิชานี้สอนชั้นปี % — เลือกภาคของชั้นปีให้ตรงกัน',
      v_sem, v_level, new.student_year_level
      using errcode = '23514';
  end if;

  return new;
end $$;

-- ---------------------------------------------------------------------
-- ผู้ลงนามในแบบฟอร์ม
--
-- ช่อง (16) ผู้รับรอง = รองผู้อำนวยการด้านวิชาการ
-- ช่อง (17) ผู้อนุมัติ = ผู้อำนวยการ
-- เก็บไว้ที่เดียวกับชื่อผู้อำนวยการ เพื่อให้เปลี่ยนผู้บริหารได้โดยไม่ต้องแก้โค้ด
-- ---------------------------------------------------------------------
insert into public.app_settings (key, value, name_th) values
  ('org.deputy_academic',
   '{"prefix":"","name":"","position":"รองผู้อำนวยการด้านวิชาการ"}'::jsonb,
   'ผู้รับรอง (รองผู้อำนวยการด้านวิชาการ)')
on conflict (key) do nothing;

-- รหัสแบบฟอร์มไม่ต้องกรอกและไม่ต้องพิมพ์ลงเอกสารแล้ว
delete from public.app_settings where key = 'form.voucher_code';
