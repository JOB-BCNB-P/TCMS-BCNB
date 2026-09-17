-- =====================================================================
-- TCMS-BCNB : 0003 เอกสารการเบิกจ่าย
--   payment_vouchers        <- แบบ FM2.2-03 "หลักฐานการเบิกจ่ายเงินค่าสอนพิเศษ
--                              และค่าสอนเกินภาระงานสอนในสถาบันอุดมศึกษา"
--   treasury_cover_sheets   <- "หน้างบใบสำคัญค่าสอนพิเศษประกอบฎีกา"
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. ใบหลักฐานการเบิกจ่ายเงินค่าสอนพิเศษ (ส่วนหัว)
-- ---------------------------------------------------------------------
create table public.payment_vouchers (
  id                 uuid primary key default gen_random_uuid(),
  -- เลขที่ใบสำคัญ: ออกเมื่อส่งเอกสาร (submit) ไม่ใช่ตอนสร้างร่าง
  voucher_no         text unique,
  voucher_kind       public.voucher_kind not null,     -- ของอาจารย์พิเศษ / ของแหล่งฝึก
  course_offering_id uuid not null references public.course_offerings on delete restrict,
  -- สำเนาไว้เพื่อ RLS และการค้นย้อนหลัง (trigger ซิงก์ให้)
  department_id      uuid not null references public.departments  on delete restrict,
  fiscal_year_id     uuid not null references public.fiscal_years on delete restrict,

  -- ส่วนหัวของแบบฟอร์ม
  faculty_text       text,                             -- คณะ
  semester_text      text,                             -- ภาคการศึกษา (พิมพ์ลงแบบฟอร์ม)
  year_be            smallint,                         -- พ.ศ. บนแบบฟอร์ม
  subject_text       text,                             -- วิชา
  teaching_level     public.teaching_level not null default 'bachelor',
  doc_date           date not null default public.today_bkk(),

  -- ช่องลงนาม 4 ตำแหน่งตามแบบฟอร์ม
  preparer_coordinator_id uuid references public.coordinators,  -- ผู้จัดทำ
  preparer_position  text,
  preparer_date      date,
  payer_name         text,  payer_position    text, payer_date    date,   -- ผู้จ่ายเงิน
  certifier_name     text,  certifier_position text, certifier_date date,  -- ผู้รับรอง
  approver_name      text,  approver_position text, approver_date  date,   -- ผู้อนุมัติ

  -- ยอดรวม (คำนวณจาก voucher_lines โดย trigger ห้ามให้ client ส่งค่ามาเอง)
  total_amount       numeric(12,2) not null default 0,
  amount_in_words    text,

  -- สถานะการเบิกจ่าย (เปลี่ยนได้เฉพาะผ่าน RPC public.set_voucher_status)
  status             public.voucher_status not null default 'draft',
  submitted_by  uuid references public.user_profiles, submitted_at timestamptz,
  verified_by   uuid references public.user_profiles, verified_at  timestamptz,
  paid_by       uuid references public.user_profiles, paid_at      timestamptz,
  payment_date       date,                             -- วันที่จ่ายเงินจริง
  payment_bank_code  text references public.banks(code),-- โอนผ่านธนาคาร
  cancel_reason      text,

  note               text,
  created_by uuid references public.user_profiles,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,                              -- soft delete (สตง. ต้องตามรอยได้)
  deleted_by uuid references public.user_profiles,

  check (status <> 'paid' or payment_date is not null),
  check (deleted_at is null or status in ('draft','cancelled'))
);

create index on public.payment_vouchers (department_id, status);
create index on public.payment_vouchers (course_offering_id);
create index on public.payment_vouchers (fiscal_year_id, status);
create index on public.payment_vouchers (payment_date);

-- ---------------------------------------------------------------------
-- 2. รายการในใบหลักฐาน (1 บรรทัด = 1 แถวของตารางในแบบฟอร์ม)
-- ---------------------------------------------------------------------
create table public.voucher_lines (
  id                 uuid primary key default gen_random_uuid(),
  voucher_id         uuid not null references public.payment_vouchers on delete cascade,
  line_no            smallint not null check (line_no > 0),

  -- ผู้รับเงิน: บุคคล หรือ แหล่งฝึก อย่างใดอย่างหนึ่ง
  payee_id           uuid references public.payees,
  clinical_site_id   uuid references public.clinical_sites,

  budget_category_id uuid not null references public.budget_categories,
  expense_item       public.expense_item not null,
  teaching_level     public.teaching_level not null default 'bachelor',
  -- ติ๊ก "ผู้ได้รับเชิญให้สอน" ตามข้อ 14.3 (ผู้ไม่ใช่ข้าราชการ/ลูกจ้างของรัฐ)
  is_invited_external boolean not null default true,

  teaching_month     date,                       -- ประจำเดือน (เก็บเป็นวันที่ 1 ของเดือน)
  student_year_level smallint check (student_year_level between 1 and 4),
  hours              numeric(7,2) check (hours >= 0),   -- จำนวนหน่วยชั่วโมง
  rate               numeric(10,2) check (rate >= 0),
  amount             numeric(12,2) not null check (amount >= 0),
  receipt_date       date,                       -- วัน เดือน ปี ที่รับเงิน
  note               text,                       -- หมายเหตุ

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (voucher_id, line_no),
  constraint voucher_line_one_payee
    check (num_nonnulls(payee_id, clinical_site_id) = 1),
  constraint voucher_line_month_is_first_day
    check (teaching_month is null or extract(day from teaching_month) = 1)
);

create index on public.voucher_lines (voucher_id);
create index on public.voucher_lines (payee_id);
create index on public.voucher_lines (clinical_site_id);

-- ---------------------------------------------------------------------
-- 3. เช็คลิสต์เอกสารแนบ (7 รายการ)
-- ---------------------------------------------------------------------
create table public.checklist_items (
  key        text primary key,
  name_th    text not null,
  sort_order smallint not null,
  is_active  boolean not null default true
);

create table public.voucher_checklists (
  voucher_id uuid not null references public.payment_vouchers on delete cascade,
  item_key   text not null references public.checklist_items,
  is_checked boolean not null default false,
  checked_by uuid references public.user_profiles,
  checked_at timestamptz,
  primary key (voucher_id, item_key)
);

-- ---------------------------------------------------------------------
-- 4. หน้างบใบสำคัญค่าสอนพิเศษประกอบฎีกา
-- ---------------------------------------------------------------------
create table public.treasury_cover_sheets (
  id             uuid primary key default gen_random_uuid(),
  sheet_no       text,                                  -- "ประกอบฎีกาที่ ......"
  fiscal_year_id uuid not null references public.fiscal_years on delete restrict,
  -- กลุ่มหัวเรื่องตามแบบฟอร์ม
  teacher_type   text not null check (teacher_type in ('regular','special')),
                 -- 'regular' = อาจารย์, 'special' = อาจารย์พิเศษ
  study_level    text not null check (study_level in ('bachelor','below_bachelor')),
                 -- ปริญญาตรี / ต่ำกว่าปริญญาตรี
  program_name   text not null default 'พยาบาลศาสตรบัณฑิต',
  student_year_level smallint check (student_year_level between 1 and 4),
  period_month   date not null,                         -- ประจำเดือน (วันที่ 1 ของเดือน)

  requester_name text, requester_position text, request_date date,   -- ผู้เบิก
  approver_name  text, approver_position  text, approve_date date,   -- ผู้อนุมัติ (ผอ.)

  total_amount   numeric(12,2) not null default 0,
  status         public.voucher_status not null default 'draft',
  note           text,
  created_by uuid references public.user_profiles,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.user_profiles,
  constraint cover_sheet_month_is_first_day
    check (extract(day from period_month) = 1)
);

create table public.treasury_cover_sheet_items (
  id         uuid primary key default gen_random_uuid(),
  sheet_id   uuid not null references public.treasury_cover_sheets on delete cascade,
  -- ใบสำคัญ 1 ใบขึ้นหน้างบได้เพียงครั้งเดียว (กันเบิกซ้ำ)
  voucher_id uuid not null references public.payment_vouchers on delete restrict unique,
  line_no    smallint not null,
  teacher_name text not null,          -- ชื่อผู้สอน (snapshot ณ วันทำเอกสาร)
  subject_text text not null,          -- วิชา
  hours      numeric(7,2),             -- หน่วยชั่วโมง
  amount     numeric(12,2) not null check (amount >= 0),   -- จำนวนเงิน
  subtotal   numeric(12,2) not null check (subtotal >= 0), -- รวมเงิน
  note       text,
  unique (sheet_id, line_no)
);

create index on public.treasury_cover_sheet_items (sheet_id);

comment on table public.treasury_cover_sheet_items is
  'เก็บชื่อผู้สอน/ชื่อวิชาเป็น snapshot เพราะเอกสารที่พิมพ์ส่งฎีกาแล้วต้องไม่เปลี่ยนตามการแก้ไขข้อมูลหลักในภายหลัง';
