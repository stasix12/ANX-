<#
    Creates the everyday launcher: a Desktop shortcut to start-worker.cmd, and
    optionally a copy in the Startup folder so the worker comes up with Windows.

    This lives in PowerShell rather than the .cmd because the shortcut name is
    Hebrew, and a .ps1 saved as UTF-8 with a BOM is decoded correctly whatever
    the console codepage happens to be - which a batch file is not.
#>

$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }

$repo     = Split-Path -Parent $PSScriptRoot
$target   = Join-Path $repo 'start-worker.cmd'
$icon     = Join-Path $PSScriptRoot 'worker-icon.ico'
$linkName = 'הפתרון המבריק - פרסום.lnk'

if (-not (Test-Path $target)) {
    Write-Host ''
    Write-Host '  [!] לא מצאתי את start-worker.cmd ליד הקובץ הזה.' -ForegroundColor Red
    Write-Host '      הריצו את המתקין מתוך תיקיית הפרויקט.'
    Write-Host ''
    exit 1
}

function New-Launcher([string]$Path) {
    $s = (New-Object -ComObject WScript.Shell).CreateShortcut($Path)
    $s.TargetPath       = $target
    $s.WorkingDirectory = $repo
    $s.Description      = 'מפעיל את ה-worker שמפרסם בקבוצות פייסבוק'
    if (Test-Path $icon) { $s.IconLocation = $icon }
    $s.Save()
}

$desktop = [Environment]::GetFolderPath('Desktop')
$link    = Join-Path $desktop $linkName
New-Launcher $link

Write-Host ''
Write-Host '  ============================================' -ForegroundColor Green
Write-Host '    מוכן. יש לכם סמל על שולחן העבודה:' -ForegroundColor Green
Write-Host '      הפתרון המבריק - פרסום' -ForegroundColor Green
Write-Host '  ============================================' -ForegroundColor Green
Write-Host ''
Write-Host '  מהיום: לחיצה כפולה על הסמל - וזהו.'
Write-Host ''

# Starting with Windows changes how the machine boots, so it is asked, not assumed.
Write-Host '  להפעיל את התוכנה אוטומטית בכל הדלקה של המחשב?'
Write-Host '  (מומלץ - אחרת פרסומים מתוזמנים לא יצאו כשהיא סגורה)'
Write-Host ''
# Empty means yes, anything typed means no. Matching a letter would depend on
# the keyboard layout in use, and this machine types Russian and Hebrew.
$answer = Read-Host '  Enter = כן  |  כל תו אחר ואז Enter = לא'

if (-not [string]::IsNullOrWhiteSpace($answer)) {
    Write-Host ''
    Write-Host '  בסדר - רק הסמל בשולחן העבודה.'
    Write-Host '  אפשר להוסיף הפעלה אוטומטית בכל רגע: להריץ את הקובץ הזה שוב.'
} else {
    $startup = [Environment]::GetFolderPath('Startup')
    New-Launcher (Join-Path $startup $linkName)
    Write-Host ''
    Write-Host '  נוסף. מעכשיו התוכנה עולה יחד עם המחשב.' -ForegroundColor Green
    Write-Host ''
    Write-Host '  לביטול בעתיד: Win+R, להקליד shell:startup, ולמחוק משם את הסמל.'
    Write-Host '  שימו לב: המחשב צריך להישאר דלוק (לא במצב שינה) בשעות ההפצה.'
}

Write-Host ''
