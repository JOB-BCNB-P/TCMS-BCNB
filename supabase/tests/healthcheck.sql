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
         (select count(*) from public.menus)::int, 19
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
         (select count(*) from pg_policies where schemaname='public')::int, 68
  union all select '*** ตารางที่เปิด RLS แต่ไม่มี policy เลย (เข้าถึงไม่ได้) ***',
         (select count(*) from pg_tables t
           where t.schemaname='public'
             and not exists (select 1 from pg_policies p
                             where p.schemaname='public' and p.tablename=t.tablename))::int, 0
  union all select '*** policy FOR ALL บนตารางผู้รับเงิน (ต้องไม่มี) ***',
         (select count(*) from pg_policies
           where schemaname='public' and tablename='payees' and cmd='ALL')::int, 0
)
select รายการ, พบ, ควรมี,
       case when พบ = ควรมี then 'ผ่าน' else '>>> ไม่ตรง <<<' end as ผล
from c;
