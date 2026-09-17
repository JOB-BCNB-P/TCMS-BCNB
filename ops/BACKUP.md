# การสำรองข้อมูลและกู้คืน TCMS-BCNB

**การตัดสินใจของวิทยาลัย:** ไม่เข้ารหัสเลขบัญชีในฐานข้อมูล แต่เข้ารหัสไฟล์สำรอง
แล้วเก็บไว้ใน Google Drive ของบัญชีผู้ดูแลระบบ · สำรองด้วย `pg_dump` อัตโนมัติจากเครื่องของวิทยาลัย

---

## 1. สิ่งที่ต้องเข้าใจก่อนตั้งค่า

ไฟล์ `pg_dump` **มีเลขที่บัญชีธนาคารทุกรายการเป็นข้อความธรรมดา** เพราะฐานข้อมูลไม่ได้เข้ารหัสไว้
ดังนั้นในการออกแบบนี้ **การเข้ารหัสไฟล์สำรองคือมาตรการป้องกันชั้นเดียวที่มี** ไม่ใช่ชั้นเสริม

ผลที่ตามมาสามข้อ ซึ่งต้องจัดการให้เรียบร้อยก่อนใช้งานจริง

| ประเด็น | ทำไมสำคัญ | ต้องทำอะไร |
|---|---|---|
| **รหัสผ่านหายเท่ากับข้อมูลหาย** | ไฟล์ที่เข้ารหัส AES-256 ถ้าไม่มีรหัสผ่านก็กู้ไม่ได้เลย ไม่มีทางลัด | เก็บรหัสผ่านไว้สองที่: ผู้ดูแลระบบ และซองปิดผนึกในตู้นิรภัยของวิทยาลัย |
| **Google Drive ส่วนตัวผูกกับคนเดียว** | ถ้าผู้ดูแลระบบลาออกหรือบัญชีถูกปิด ไฟล์สำรองทั้งหมดหายไปพร้อมกัน | ใช้ **Shared Drive ของวิทยาลัย** แทน Drive ส่วนตัว วิทยาลัยจะเป็นเจ้าของไฟล์ ไม่ใช่บุคคล |
| **ไฟล์สำรองอยู่บนคลาวด์ต่างประเทศ** | ข้อมูลส่วนบุคคลของอาจารย์พิเศษออกนอกประเทศ | ปรึกษาผู้รับผิดชอบด้าน PDPA ของวิทยาลัยก่อนนำข้อมูลจริงขึ้นระบบ |

สคริปต์เขียนไว้ให้ **dump ลงพื้นที่ชั่วคราวในเครื่องก่อน แล้วย้ายเฉพาะไฟล์ที่เข้ารหัสแล้วเข้า Google Drive**
ถ้า dump ลงโฟลเดอร์ Drive ตรง ๆ ตัวซิงก์จะอัปโหลดไฟล์ที่ยังไม่เข้ารหัสขึ้นคลาวด์ทันที

---

## 2. ติดตั้งครั้งเดียว

### 2.0 หาพาธ Google Drive ที่ถูกต้องก่อน — ขั้นตอนนี้พลาดบ่อยที่สุด

Google Drive รุ่นปัจจุบัน (Drive for desktop) **ไม่ได้** ติดตั้งไว้ที่ `C:\Users\<ชื่อ>\Google Drive`
แต่ติดตั้งเป็นไดรฟ์แยก เช่น `G:\My Drive\...` หรือ `G:\Shared drives\...`

หาพาธจริงด้วยคำสั่งนี้

```powershell
Get-PSDrive -PSProvider FileSystem | Select-Object Name, Root, Description
Get-ChildItem 'G:\' -ErrorAction SilentlyContinue
```

แล้วสร้างโฟลเดอร์ปลายทางด้วยตัวเองใน **Shared Drive ของวิทยาลัย** (ไม่ใช่ My Drive ส่วนตัว)

```powershell
New-Item -ItemType Directory -Path 'G:\Shared drives\<ชื่อ Shared Drive>\TCMS-Backup' -Force
```

> สคริปต์ **จะไม่สร้างโฟลเดอร์ปลายทางให้เอง** และจะหยุดทำงานพร้อมข้อความผิดพลาดถ้าหาไม่เจอ
> นี่เป็นความตั้งใจ เพราะถ้าพาธผิดแล้วสคริปต์สร้างโฟลเดอร์ให้ ไฟล์สำรองจะกองอยู่ในฮาร์ดดิสก์
> ไม่เคยขึ้นคลาวด์ และไม่มีใครรู้จนถึงวันที่ต้องใช้จริง

### 2.1 เครื่องมือที่ต้องมี

- PostgreSQL client tools เวอร์ชัน 15 ขึ้นไป (เอา `pg_dump` และ `pg_restore`)
- GnuPG (`gpg`)

ทั้งสองต้องอยู่ใน `PATH` — ตรวจด้วย `pg_dump --version` และ `gpg --version` ใน PowerShell

### 2.2 เก็บความลับแบบเข้ารหัสด้วย DPAPI

รันคำสั่งชุดนี้ **ในบัญชีผู้ใช้วินโดวส์เดียวกับที่ Task Scheduler จะใช้รัน**
ไฟล์ที่ได้ถอดรหัสได้เฉพาะผู้ใช้คนนั้นบนเครื่องนั้น แม้คัดลอกไฟล์ออกไปก็เปิดไม่ได้

```powershell
New-Item -ItemType Directory -Path "$env:LOCALAPPDATA\TCMS" -Force | Out-Null

# connection string จาก Supabase: Project Settings > Database > Connection string > URI
$dbUrl = Read-Host -AsSecureString "วาง Database connection string ของ Supabase"

# รหัสผ่านสำหรับเข้ารหัสไฟล์สำรอง — ตั้งใหม่ ยาวอย่างน้อย 20 ตัวอักษร
# ห้ามใช้ซ้ำกับรหัสผ่านอื่นของวิทยาลัย
$pass  = Read-Host -AsSecureString "ตั้งรหัสผ่านสำหรับเข้ารหัสไฟล์สำรอง"

[pscustomobject]@{ DatabaseUrl = $dbUrl; Passphrase = $pass } |
  Export-CliXml -Path "$env:LOCALAPPDATA\TCMS\backup-secrets.xml"
```

> **หลังทำขั้นตอนนี้แล้ว จดรหัสผ่านลงกระดาษ ใส่ซองปิดผนึก มอบให้ผู้บริหารเก็บในตู้นิรภัย**
> นี่ไม่ใช่ขั้นตอนเสริม — ถ้าเครื่องเสียพร้อมกับที่ลืมรหัสผ่าน ไฟล์สำรองทุกไฟล์กลายเป็นขยะทันที

### 2.3 ตั้ง Task Scheduler

```powershell
# ใส่พาธ Google Drive จริงที่หาได้จาก §2.0 ลงใน -DriveFolder
$action  = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument '-NoProfile -ExecutionPolicy Bypass -File "D:\TCMS-BCNB\ops\backup-tcms.ps1" -DriveFolder "G:\Shared drives\<ชื่อ Shared Drive>\TCMS-Backup"'
$trigger = New-ScheduledTaskTrigger -Daily -At 01:30
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable `
  -DontStopOnIdleEnd -RestartCount 2 -RestartInterval (New-TimeSpan -Minutes 15)

Register-ScheduledTask -TaskName 'TCMS-BCNB Backup' -Action $action `
  -Trigger $trigger -Settings $settings -RunLevel Limited -Description 'สำรองฐานข้อมูล TCMS-BCNB รายวัน'
```

`-StartWhenAvailable` สำคัญ เพราะเครื่องในสำนักงานมักปิดตอนกลางคืน ถ้าไม่ใส่ งานที่พลาดจะไม่ถูกรันชดเชย

---

## 3. การเฝ้าระวัง

**การสำรองข้อมูลที่ล้มเหลวเงียบ ๆ อันตรายกว่าการไม่มีการสำรองข้อมูลเลย** เพราะทุกคนคิดว่ามีอยู่

สคริปต์เขียน Event Log (`Application` / source `TCMS-Backup` / Event ID 1001) เมื่อล้มเหลว
ให้ตั้ง Task Scheduler อีกงานหนึ่งผูกกับ event นี้เพื่อส่งอีเมลแจ้งผู้ดูแลระบบ

ตรวจด้วยมืออย่างน้อยเดือนละครั้ง:

```powershell
Get-ChildItem 'G:\Shared drives\<ชื่อ Shared Drive>\TCMS-Backup\tcms-*.dump.gpg' |
  Sort-Object LastWriteTime -Descending | Select-Object -First 7 Name, Length, LastWriteTime
```

ถ้าเคยตั้ง Scheduled Task ไว้แล้วด้วยพาธเดิมที่ผิด ให้แก้ด้วย

```powershell
$a = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument '-NoProfile -ExecutionPolicy Bypass -File "D:\TCMS-BCNB\ops\backup-tcms.ps1" -DriveFolder "G:\Shared drives\<ชื่อ>\TCMS-Backup"'
Set-ScheduledTask -TaskName 'TCMS-BCNB Backup' -Action $a
```

ไฟล์ล่าสุดต้องเป็นของเมื่อวาน และขนาดต้องไม่ลดลงฮวบฮาบจากไฟล์ก่อนหน้า
ขนาดที่หดผิดปกติมักแปลว่า dump ได้ไม่ครบ

---

## 4. การกู้คืน

### 4.1 ถอดรหัสและกู้คืน

```powershell
# ถอดรหัส (จะถามรหัสผ่าน)
gpg --output tcms-restore.dump --decrypt tcms-20260917-013000.dump.gpg

# กู้คืนลงฐานข้อมูลทดสอบก่อนเสมอ ห้ามกู้ทับฐานข้อมูลจริงในการซ้อม
pg_restore --dbname="postgresql://...ฐานข้อมูลทดสอบ..." --no-owner --no-privileges --clean --if-exists tcms-restore.dump

# ลบไฟล์ที่ถอดรหัสแล้วทิ้งทันทีเมื่อเสร็จ — ไฟล์นี้มีเลขบัญชีเป็นข้อความธรรมดา
Remove-Item tcms-restore.dump -Force
```

### 4.2 การซ้อมกู้คืนประจำปี

**ต้องทำอย่างน้อยปีละครั้ง และบันทึกผลไว้เป็นหลักฐานการควบคุมภายใน**
ไฟล์สำรองที่ไม่เคยกู้คืน คือไฟล์สำรองที่ยังไม่รู้ว่าใช้ได้หรือไม่

รายการตรวจหลังกู้คืนลงฐานข้อมูลทดสอบ

- [ ] จำนวนแถวใน `payment_vouchers` ตรงกับระบบจริง ณ วันที่สำรอง
- [ ] ยอดรวม `sum(total_amount)` ของปีงบประมาณปัจจุบันตรงกัน
- [ ] `select count(*) from private.bank_accounts` ได้จำนวนที่ถูกต้อง
- [ ] `audit.activity_log` มีข้อมูลครบ ไม่ขาดช่วง
- [ ] รันชุดทดสอบ `supabase/tests/rls_smoke_test.sql` บนฐานข้อมูลที่กู้คืนแล้วผ่านทุกข้อ
- [ ] บันทึกวันที่ ผู้ทดสอบ และผลการทดสอบไว้ในแฟ้มควบคุมภายใน

---

## 5. สิ่งที่การสำรองแบบนี้ **ไม่** ครอบคลุม

ต้องเข้าใจขอบเขตให้ตรงกัน มิฉะนั้นจะคิดว่าปลอดภัยกว่าความเป็นจริง

| ไม่ครอบคลุม | ผลกระทบ | ทางแก้ |
|---|---|---|
| กู้คืนไปยังเวลาใดก็ได้ (PITR) | ถ้าข้อมูลเสียหายตอน 15:00 น. จะกู้ได้แค่ถึงตี 1.30 ของวันนั้น งานทั้งวันหายไป | อัปเกรด Supabase เป็นแพ็กเกจ Pro ถ้าวิทยาลัยรับความเสี่ยงนี้ไม่ได้ |
| บัญชีผู้ใช้ใน `auth.users` | `pg_dump` ปกติไม่ได้ dump schema `auth` ของ Supabase | ผู้ใช้ล็อกอินด้วย Google ใหม่ได้ แต่ **ต้องกำหนดบทบาทและขอบเขตสาขาใหม่ทั้งหมด** — เก็บสำเนาตาราง `user_profiles` และ `user_department_scopes` ไว้ (อยู่ใน dump แล้ว) เพื่อใช้ตั้งค่ากลับ |
| ไฟล์ใน Supabase Storage | เอกสารแนบที่อัปโหลดไว้ไม่ได้ถูกสำรอง | ถ้ารอบต่อไปเริ่มใช้ Storage ต้องเพิ่มขั้นตอนสำรองแยก |
| เครื่องที่รันสคริปต์เสียหาย | ไม่มีไฟล์สำรองใหม่ และไม่มีใครรู้ | การแจ้งเตือนใน §3 คือสิ่งที่กันเรื่องนี้ |
