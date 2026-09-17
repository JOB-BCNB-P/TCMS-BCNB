<#
.SYNOPSIS
  สำรองฐานข้อมูล TCMS-BCNB จาก Supabase เข้ารหัส แล้วเก็บลงโฟลเดอร์ Google Drive

.DESCRIPTION
  รันบนเครื่องของวิทยาลัยผ่าน Task Scheduler (ไม่ได้รันบน GitHub Actions
  เพราะ GitHub ใช้เก็บเฉพาะโค้ดหน้าเว็บ ฐานข้อมูลอยู่ที่ Supabase)

  ไฟล์ dump มีเลขที่บัญชีธนาคารของอาจารย์พิเศษและแหล่งฝึกเป็นข้อความธรรมดา
  เนื่องจากยังไม่ได้เข้ารหัสในฐานข้อมูล การเข้ารหัสไฟล์สำรองจึงเป็น
  มาตรการป้องกันชั้นเดียวที่มีอยู่ — สคริปต์นี้จะไม่ยอมเขียนไฟล์ที่ไม่ได้เข้ารหัส
  ลงโฟลเดอร์ Google Drive เด็ดขาด

.NOTES
  ต้องติดตั้งก่อน
    1. PostgreSQL client tools (pg_dump เวอร์ชัน 15 ขึ้นไป)
    2. GnuPG (gpg)

  ตั้งค่าครั้งเดียวก่อนใช้งาน — ดูขั้นตอนใน ops/BACKUP.md
#>

[CmdletBinding()]
param(
  # โฟลเดอร์ปลายทางที่ซิงก์กับ Google Drive บนเครื่องนี้
  # ไม่มีค่าเริ่มต้นโดยเจตนา — ต้องระบุเองเสมอ ดูวิธีหาพาธจริงใน ops/BACKUP.md §2.0
  [Parameter(Mandatory = $true)]
  [string]$DriveFolder,

  # ไฟล์เก็บความลับแบบ DPAPI (ถอดได้เฉพาะผู้ใช้คนนี้บนเครื่องนี้เท่านั้น)
  [string]$SecretFile  = "$env:LOCALAPPDATA\TCMS\backup-secrets.xml",

  # เก็บย้อนหลังกี่วัน (ระเบียบการเก็บเอกสารราชการอาจกำหนดนานกว่านี้ — ตรวจสอบก่อนตั้งค่า)
  [int]$RetentionDays  = 180
)

$ErrorActionPreference = 'Stop'
$stamp   = Get-Date -Format 'yyyyMMdd-HHmmss'
$logFile = Join-Path $DriveFolder "backup-log.txt"

function Write-Log([string]$msg) {
  $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $msg"
  Write-Host $line
  if (Test-Path $DriveFolder) { Add-Content -Path $logFile -Value $line -Encoding utf8 }
}

try {
  # --- ตรวจเครื่องมือ ---------------------------------------------------
  foreach ($tool in 'pg_dump', 'gpg') {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
      throw "ไม่พบคำสั่ง $tool — ติดตั้งก่อนแล้วเพิ่มลง PATH"
    }
  }
  if (-not (Test-Path $SecretFile)) {
    throw "ไม่พบไฟล์ความลับ $SecretFile — ทำตามขั้นตอนใน ops/BACKUP.md ก่อน"
  }
  # ห้ามสร้างโฟลเดอร์ปลายทางเอง
  # ถ้าพาธผิด (เช่น Google Drive ติดตั้งเป็นไดรฟ์ G: แต่สคริปต์ชี้ไป C:\Users\...\Google Drive)
  # การสร้างให้อัตโนมัติจะทำให้ไฟล์สำรองกองอยู่ในเครื่อง ไม่เคยขึ้นคลาวด์
  # และไม่มีใครรู้จนถึงวันที่ต้องใช้ — ล้มเหลวแบบเงียบที่อันตรายที่สุด
  if (-not (Test-Path $DriveFolder)) {
    throw "ไม่พบโฟลเดอร์ปลายทาง $DriveFolder — ตรวจพาธของ Google Drive บนเครื่องนี้ก่อน (ops/BACKUP.md §2.0) สคริปต์จะไม่สร้างให้เอง"
  }
  $parent = Split-Path $DriveFolder -Parent
  if (-not (Test-Path $parent)) {
    throw "โฟลเดอร์แม่ $parent ไม่มีอยู่จริง — พาธ Google Drive น่าจะผิด"
  }

  # --- อ่านความลับ ------------------------------------------------------
  # Import-CliXml ถอดรหัสด้วย DPAPI ให้อัตโนมัติ
  # ผู้ใช้อื่นหรือเครื่องอื่นเปิดไฟล์นี้ไม่ได้ แม้จะคัดลอกไฟล์ไป
  $secrets   = Import-CliXml -Path $SecretFile
  $dbUrlPlain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secrets.DatabaseUrl))
  $passPlain  = [Runtime.InteropServices.Marshal]::PtrToStringBSTR(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secrets.Passphrase))

  # --- ทำ dump ลงพื้นที่ชั่วคราวในเครื่อง ไม่ใช่ใน Google Drive ------------
  # เพราะ Google Drive จะซิงก์ไฟล์ขึ้นคลาวด์ทันทีที่เขียน
  # ถ้า dump ลงตรงนั้น ไฟล์ที่ยังไม่เข้ารหัสจะถูกอัปโหลดไปก่อน
  $tempDir  = Join-Path $env:TEMP "tcms-backup-$stamp"
  New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
  $dumpFile = Join-Path $tempDir "tcms-$stamp.dump"

  Write-Log "เริ่มสำรองข้อมูล"
  # -Fc = custom format (บีบอัดและกู้คืนแบบเลือกตารางได้)
  # ส่ง connection string ทาง argument ของ pg_dump โดยตรง
  & pg_dump --dbname=$dbUrlPlain --format=custom --no-owner --no-privileges `
            --file=$dumpFile 2>&1 | ForEach-Object { Write-Log "pg_dump: $_" }
  if ($LASTEXITCODE -ne 0) { throw "pg_dump ล้มเหลว (exit $LASTEXITCODE)" }

  $sizeMB = [math]::Round((Get-Item $dumpFile).Length / 1MB, 2)
  if ($sizeMB -lt 0.01) { throw "ไฟล์ dump เล็กผิดปกติ ($sizeMB MB) — ตรวจสอบการเชื่อมต่อ" }
  Write-Log "dump สำเร็จ ขนาด $sizeMB MB"

  # --- เข้ารหัสแบบสมมาตร AES-256 --------------------------------------
  # ส่งรหัสผ่านทาง stdin ไม่ใส่ในบรรทัดคำสั่ง มิฉะนั้นจะเห็นได้จาก Task Manager
  $encFile = Join-Path $tempDir "tcms-$stamp.dump.gpg"
  $passPlain | & gpg --batch --yes --quiet --passphrase-fd 0 --pinentry-mode loopback `
                     --symmetric --cipher-algo AES256 --output $encFile $dumpFile
  if ($LASTEXITCODE -ne 0) { throw "การเข้ารหัสล้มเหลว (exit $LASTEXITCODE)" }
  if (-not (Test-Path $encFile)) { throw "ไม่พบไฟล์ที่เข้ารหัส" }
  Write-Log "เข้ารหัสสำเร็จ"

  # --- ย้ายเฉพาะไฟล์ที่เข้ารหัสแล้วเข้า Google Drive ---------------------
  Move-Item -Path $encFile -Destination (Join-Path $DriveFolder "tcms-$stamp.dump.gpg") -Force
  Write-Log "บันทึกลง Google Drive: tcms-$stamp.dump.gpg"

  # --- ลบไฟล์เก่าเกินกำหนด ---------------------------------------------
  $cutoff = (Get-Date).AddDays(-$RetentionDays)
  Get-ChildItem -Path $DriveFolder -Filter 'tcms-*.dump.gpg' |
    Where-Object { $_.LastWriteTime -lt $cutoff } |
    ForEach-Object {
      Write-Log "ลบไฟล์เก่า: $($_.Name)"
      Remove-Item $_.FullName -Force
    }

  Write-Log "เสร็จสมบูรณ์"
  exit 0
}
catch {
  Write-Log "ผิดพลาด: $($_.Exception.Message)"
  # เขียน Event Log เพื่อให้ตั้งการแจ้งเตือนได้ และเพื่อให้รู้ว่า backup ล้มเหลว
  # การสำรองข้อมูลที่ล้มเหลวเงียบ ๆ อันตรายกว่าการไม่มีการสำรองข้อมูลเลย
  try {
    if (-not [System.Diagnostics.EventLog]::SourceExists('TCMS-Backup')) {
      New-EventLog -LogName Application -Source 'TCMS-Backup'
    }
    Write-EventLog -LogName Application -Source 'TCMS-Backup' -EntryType Error `
                   -EventId 1001 -Message "TCMS backup failed: $($_.Exception.Message)"
  } catch { }
  exit 1
}
finally {
  # ล้างร่องรอยเสมอ แม้เกิดข้อผิดพลาดกลางคัน
  if ($tempDir -and (Test-Path $tempDir)) {
    Remove-Item $tempDir -Recurse -Force -ErrorAction SilentlyContinue
  }
  Remove-Variable dbUrlPlain, passPlain -ErrorAction SilentlyContinue
  [System.GC]::Collect()
}
