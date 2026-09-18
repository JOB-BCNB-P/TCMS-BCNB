-- ตรวจสุขภาพการติดตั้ง TCMS-BCNB — อ่านอย่างเดียว ไม่แก้อะไร
with c as (
  select 'หมวดเงิน (budget_categories)'          as รายการ,
         (select count(*) from public.budget_categories)::int as พบ, 10 as ควรมี
  union all select 'อัตราค่าตอบแทน (pay_rates)',
         (select count(*) from public.pay_rates)::int, 12
  union all select 'สาขาวิชา (departments)',
         (select count(*) from public.departments)::int, 5
  union all select 'เช็คลิสต์เอกสารแนบ',
         (select count(*) from public.checklist_items)::int, 7
  union all select 'บทบาท (roles)',
         (select count(*) from public.roles)::int, 6
  union all select 'เมนู (menus)',
         (select count(*) from public.menus)::int, 20
  union all select 'ปีงบประมาณ',
         (select count(*) from public.fiscal_years)::int, 3
  union all select '*** ตารางใน public ที่ยังไม่เปิด RLS ***',
         (select count(*) from pg_tables t
           where t.schemaname='public'
             and not exists (select 1 from pg_class cl
                             join pg_namespace n on n.oid=cl.relnamespace
                             where n.nspname='public' and cl.relname=t.tablename
                               and cl.relrowsecurity))::int, 0
  union all select '*** trigger กันอีเมลนอกโดเมน ***',
         (select count(*) from pg_trigger
           where tgname='trg_auth_users_enforce_domain' and not tgisinternal)::int, 1
  union all select '*** trigger สร้างโปรไฟล์อัตโนมัติ ***',
         (select count(*) from pg_trigger
           where tgname='trg_auth_users_create_profile' and not tgisinternal)::int, 1
  union all select '*** trigger กันเบิกเกินวงเงิน ***',
         (select count(*) from pg_trigger
           where tgname='trg_voucher_lines_budget' and not tgisinternal)::int, 1
  union all select '*** trigger กันเบิกผิดอัตรา ***',
         (select count(*) from pg_trigger
           where tgname='trg_voucher_lines_pay_rate' and not tgisinternal)::int, 1
  union all select '*** ตาราง private.bank_accounts ***',
         (select count(*) from pg_tables where schemaname='private'
           and tablename='bank_accounts')::int, 1
  union all select '*** ตาราง audit (ห้ามลบได้) ***',
         (select count(*) from pg_tables where schemaname='audit')::int, 2
  union all select 'RLS policy ทั้งหมด',
         (select count(*) from pg_policies where schemaname='public')::int, 86
  union all select '*** ตารางที่เปิด RLS แต่ไม่มี policy เลย (เข้าถึงไม่ได้) ***',
         (select count(*) from pg_tables t
           where t.schemaname='public'
             and not exists (select 1 from pg_policies p
                             where p.schemaname='public' and p.tablename=t.tablename))::int, 0
  union all select 'ตารางเชื่อมหลายสาขา (course/coordinator/site)',
         (select count(*) from pg_tables where schemaname='public'
           and tablename in ('course_departments','coordinator_departments','clinical_site_departments'))::int, 3
  union all select '*** สาขาเจ้าภาพที่หายไปจากตารางเชื่อมรายวิชา (ต้องเป็น 0) ***',
         (select count(*) from public.courses c
           where not exists (select 1 from public.course_departments cd
                             where cd.course_id = c.id and cd.department_id = c.department_id))::int, 0
  union all select '*** policy FOR ALL บนตารางผู้รับเงิน (ต้องไม่มี) ***',
         (select count(*) from pg_policies
           where schemaname='public' and tablename='payees' and cmd='ALL')::int, 0
  union all select '*** trigger บันทึกผู้จัดทำหน้างบฯ (ถ้าไม่มี การแบ่งแยกหน้าที่ไร้ผล) ***',
         (select count(*) from pg_trigger
           where tgname='trg_cover_sheet_sync_keys' and not tgisinternal)::int, 1
  union all select '*** trigger คำนวณยอดรวมหน้างบฯ ***',
         (select count(*) from pg_trigger
           where tgname='trg_cover_sheet_items_total' and not tgisinternal)::int, 1
  union all select '*** trigger ตรวจใบสำคัญก่อนขึ้นฎีกา ***',
         (select count(*) from pg_trigger
           where tgname='trg_cover_sheet_item_guard' and not tgisinternal)::int, 1
  union all select '*** หน้างบฯ ที่ไม่มีผู้จัดทำ (ต้องเป็น 0) ***',
         (select count(*) from public.treasury_cover_sheets where created_by is null)::int, 0
  union all select '*** สิทธิ์แก้คอลัมน์ total_amount ของหน้างบฯ (ต้องไม่มี) ***',
         (select count(*) from information_schema.column_privileges
           where table_schema='public' and table_name='treasury_cover_sheets'
             and column_name='total_amount' and privilege_type='UPDATE'
             and grantee='authenticated')::int, 0
  union all select 'เมนูรายวิชาที่เปิดสอน',
         (select count(*) from public.menus where key='master.offering')::int, 1
  union all select '*** trigger สร้างเช็คลิสต์ให้ใบสำคัญ (ถ้าไม่มี การตรวจเอกสารแนบจะผ่านเปล่า) ***',
         (select count(*) from pg_trigger
           where tgname='trg_voucher_seed_checklist' and not tgisinternal)::int, 1
  union all select '*** สิทธิ์แก้คอลัมน์ total_amount ของใบสำคัญ (ต้องไม่มี) ***',
         (select count(*) from information_schema.column_privileges
           where table_schema='public' and table_name='payment_vouchers'
             and column_name='total_amount' and privilege_type='UPDATE'
             and grantee='authenticated')::int, 0
  union all select '*** สิทธิ์แก้คอลัมน์ status ของใบสำคัญ (ต้องไม่มี) ***',
         (select count(*) from information_schema.column_privileges
           where table_schema='public' and table_name='payment_vouchers'
             and column_name='status' and privilege_type='UPDATE'
             and grantee='authenticated')::int, 0
  union all select '*** ใบสำคัญสถานะร่างที่ไม่มีเช็คลิสต์ (ต้องเป็น 0) ***',
         (select count(*) from public.payment_vouchers v
           where v.status = 'draft'
             and not exists (select 1 from public.voucher_checklists c
                             where c.voucher_id = v.id))::int, 0
)
select รายการ, พบ, ควรมี,
       case when พบ = ควรมี then 'ผ่าน' else '>>> ไม่ตรง <<<' end as ผล
from c;
