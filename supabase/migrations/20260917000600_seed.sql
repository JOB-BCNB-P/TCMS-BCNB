-- =====================================================================
-- TCMS-BCNB : 0006 ข้อมูลตั้งต้น
-- =====================================================================

-- บทบาท ------------------------------------------------------------------
insert into public.roles (code, name_th) values
  ('admin',      'ผู้ดูแลระบบ/ผู้รับผิดชอบการเบิกจ่ายค่าสอน'),
  ('academic',   'เจ้าหน้าที่งานวิชาการ'),
  ('secretary',  'เลขานุการสาขาวิชา'),
  ('finance',    'เจ้าหน้าที่งานการเงิน'),
  ('instructor', 'อาจารย์'),
  ('executive',  'ผู้บริหาร')
on conflict (code) do nothing;

-- สาขาวิชา ---------------------------------------------------------------
insert into public.departments (code, name_th, sort_order) values
  ('PED',  'สาขาวิชาการพยาบาลเด็ก', 1),
  ('MAT',  'สาขาวิชาการพยาบาลมารดา ทารก และผดุงครรภ์', 2),
  ('PSY',  'สาขาวิชาสุขภาพจิตและการพยาบาลจิตเวช', 3),
  ('ADU',  'สาขาวิชาการพยาบาลผู้ใหญ่และผู้สูงอายุ', 4),
  ('COM',  'สาขาวิชาการพยาบาลชุมชน', 5)
on conflict (code) do nothing;

-- หมวดเงิน ---------------------------------------------------------------
insert into public.budget_categories (code, name_th, expense_item, sort_order) values
  ('TEACH_THEORY',  'ค่าสอนทฤษฎี',            'theory',             1),
  ('TEACH_LAB',     'ค่าสอนทดลอง',            'lab',                2),
  ('TEACH_PRAC',    'ค่าสอนภาคปฏิบัติ',        'practice',           3),
  ('SITE_COMP',     'ค่าตอบแทนแหล่งฝึก',       'site_compensation',  4),
  ('SUPERVISION',   'ค่าเดินทางไปนิเทศ',       'supervision_travel', 5),
  ('SIM_PATIENT',   'ค่าตอบแทนผู้ป่วยเสมือน',  'simulated_patient',  6)
on conflict (code) do nothing;

-- เช็คลิสต์เอกสารแนบ 7 รายการ --------------------------------------------
insert into public.checklist_items (key, name_th, sort_order) values
  ('invite_theory',     'หนังสือเชิญสอน (ทฤษฎี/ทดลอง)',        1),
  ('schedule_theory',   'ตารางสอนรายวิชา (ทฤษฎี/ทดลอง)',       2),
  ('send_practice',     'หนังสือส่งฝึกภาคปฏิบัติ',              3),
  ('invite_practice',   'หนังสือเชิญสอนภาคปฏิบัติ',             4),
  ('schedule_practice', 'ตารางสอนภาคปฏิบัติ',                  5),
  ('training_schedule', 'ตารางฝึกภาคปฏิบัติ',                  6),
  ('certified_copies',  'รับรองสำเนาเอกสารแนบทุกฉบับแล้ว',      7)
on conflict (key) do nothing;

-- ธนาคารที่ใช้บ่อย -------------------------------------------------------
insert into public.banks (code, name_th) values
  ('KTB',  'ธนาคารกรุงไทย'),
  ('SCB',  'ธนาคารไทยพาณิชย์'),
  ('BBL',  'ธนาคารกรุงเทพ'),
  ('KBANK','ธนาคารกสิกรไทย'),
  ('BAY',  'ธนาคารกรุงศรีอยุธยา'),
  ('TTB',  'ธนาคารทหารไทยธนชาต'),
  ('GSB',  'ธนาคารออมสิน'),
  ('BAAC', 'ธนาคารเพื่อการเกษตรและสหกรณ์การเกษตร')
on conflict (code) do nothing;

-- เมนู -------------------------------------------------------------------
insert into public.menus (key, parent_key, name_th, sort_order) values
  ('dashboard',        null,          'หน้าหลัก / แดชบอร์ด',            1),
  ('master',           null,          'ข้อมูลรายวิชา/อาจารย์/แหล่งฝึก',  2),
  ('master.course',    'master',      'รายวิชา',                        1),
  ('master.lecturer',  'master',      'อาจารย์พิเศษ',                   2),
  ('master.preceptor', 'master',      'อาจารย์แหล่งฝึก',                3),
  ('master.coord',     'master',      'ผู้ประสานงานรายวิชา',             4),
  ('master.site',      'master',      'แหล่งฝึกปฏิบัติการ',              5),
  ('master.budget',    'master',      'หมวดเงินและวงเงินรายวิชา',        6),
  ('docs',             null,          'สร้างเอกสาร',                    3),
  ('docs.voucher',     'docs',        'สร้างใบเบิก (ใบหลักฐานการเบิกจ่าย)', 1),
  ('docs.cover',       'docs',        'หน้างบใบสำคัญฯ ประกอบฎีกา',      2),
  ('docs.checklist',   'docs',        'ใบเช็คลิสต์การเบิกจ่าย',          3),
  ('finance',          null,          'งานการเงิน',                     4),
  ('finance.status',   'finance',     'ปรับสถานะการเบิกจ่าย',            1),
  ('settings',         null,          'ตั้งค่าระบบ',                    5),
  ('settings.users',   'settings',    'จัดการผู้ใช้งาน',                 1),
  ('settings.perms',   'settings',    'สิทธิ์การเข้าถึงของแต่ละบทบาท',    2),
  ('settings.ref',     'settings',    'ปีการศึกษา/ภาคการศึกษา/ปีงบประมาณ', 3),
  ('settings.audit',   'settings',    'ร่องรอยการใช้งาน',                4)
on conflict (key) do nothing;

-- สิทธิ์เมนูเริ่มต้น (ควบคุมการแสดงผลเท่านั้น สิทธิ์จริงอยู่ที่ RLS) --------
insert into public.role_menu_permissions (role_id, menu_key, can_view, can_create, can_update, can_delete)
select r.id, m.key,
       true,
       case when r.code in ('admin','academic','secretary') then true else false end,
       case when r.code in ('admin','academic','secretary') then true else false end,
       case when r.code = 'admin' then true else false end
from public.roles r
cross join public.menus m
where (r.code = 'admin')
   or (r.code = 'academic'  and m.key not like 'settings%' and m.key <> 'docs.cover')
   or (r.code = 'secretary' and m.key not like 'settings%' and m.key not like 'finance%'
       and m.key <> 'docs.cover')
   or (r.code = 'finance'   and (m.key in ('dashboard') or m.key like 'finance%'
                                 or m.key = 'docs' or m.key = 'docs.cover'))
   or (r.code in ('instructor','executive') and (m.key = 'dashboard' or m.key like 'master%'))
on conflict do nothing;

-- อาจารย์/ผู้บริหารเป็นบทบาทอ่านอย่างเดียว
update public.role_menu_permissions p
   set can_create = false, can_update = false, can_delete = false
  from public.roles r
 where r.id = p.role_id and r.code in ('instructor','executive');

-- ปีงบประมาณ 2569-2571 (1 ต.ค. - 30 ก.ย.) --------------------------------
insert into public.fiscal_years (year_be, start_date, end_date)
select y,
       make_date(y - 543 - 1, 10, 1),
       make_date(y - 543,      9, 30)
from generate_series(2569, 2571) as y
on conflict (year_be) do nothing;

-- ปีการศึกษา -------------------------------------------------------------
insert into public.academic_years (year_be)
select y from generate_series(2568, 2570) as y
on conflict (year_be) do nothing;

-- ค่าคงที่องค์กร (แทนการ hardcode ชื่อผู้บริหารในแบบฟอร์ม) ----------------
insert into public.app_settings (key, value, name_th) values
  ('org.name',       '"วิทยาลัยพยาบาลบรมราชชนนี กรุงเทพ"'::jsonb, 'ชื่อส่วนราชการ'),
  ('org.program',    '"พยาบาลศาสตรบัณฑิต"'::jsonb,               'ชื่อหลักสูตร'),
  ('org.director',   '{"prefix":"","name":"","position":"ผู้อำนวยการวิทยาลัยพยาบาลบรมราชชนนี กรุงเทพ"}'::jsonb,
                     'ผู้อนุมัติ (ผู้อำนวยการ)'),
  ('form.voucher_code', '"FM2.2-03"'::jsonb,                     'รหัสแบบฟอร์มใบหลักฐานการเบิกจ่าย'),
  ('timezone',       '"Asia/Bangkok"'::jsonb,                    'เขตเวลา')
on conflict (key) do nothing;

comment on table public.app_settings is
  'ชื่อผู้อำนวยการถูกพิมพ์ตายอยู่ในไฟล์ PDF ต้นฉบับ ระบบนี้ดึงจากที่นี่แทน เพื่อไม่ต้องแก้โค้ดเมื่อเปลี่ยนผู้บริหาร';
