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
# Latin fallback. Creating a .lnk whose name holds characters outside the
# system ANSI codepage can fail, and this machine's is Cyrillic, not Hebrew.
$altName  = 'Hapitaron Publish.lnk'

if (-not (Test-Path $target)) {
    Write-Host ''
    Write-Host '  [!] לא מצאתי את start-worker.cmd ליד הקובץ הזה.' -ForegroundColor Red
    Write-Host '      הריצו את המתקין מתוך תיקיית הפרויקט.'
    Write-Host ''
    exit 1
}

<#
    Where the Desktop really is. With OneDrive folder redirection the shell
    folder can point into OneDrive under a localised name ("Рабочий стол"
    here), and that directory is not always present - saving into a directory
    that does not exist is what fails, with a FileNotFoundException that names
    the shortcut rather than the folder.
#>
function Resolve-Dir([string[]]$Candidates) {
    foreach ($c in $Candidates) {
        if ($c -and (Test-Path -LiteralPath $c -PathType Container)) { return $c }
    }
    # Nothing existed: fall back to the profile and create it.
    $fallback = $Candidates | Where-Object { $_ } | Select-Object -Last 1
    if ($fallback) {
        New-Item -ItemType Directory -Path $fallback -Force | Out-Null
        return $fallback
    }
    return $null
}

# The last error from New-Launcher, so a failure can say what actually went
# wrong instead of only where it was trying to write.
$script:lastError = ''

<#
    Saves the shortcut, working down a list of things that can be refused:
    the Hebrew name (outside a Cyrillic ANSI codepage) and the custom icon
    (IWshShortcut wants "file,index" and can reject a bare path). If every
    .lnk attempt fails, falls back to a plain .cmd on the Desktop - not as
    pretty, but it is a text file rather than a COM call, so it just works.
#>
function New-Launcher([string]$Dir) {
    foreach ($name in @($linkName, $altName)) {
        foreach ($useIcon in @($true, $false)) {
            $path = Join-Path $Dir $name
            try {
                $s = (New-Object -ComObject WScript.Shell).CreateShortcut($path)
                $s.TargetPath       = $target
                $s.WorkingDirectory = $repo
                $s.Description      = 'מפעיל את ה-worker שמפרסם בקבוצות פייסבוק'
                if ($useIcon -and (Test-Path -LiteralPath $icon)) {
                    # The index is not optional in practice.
                    $s.IconLocation = "$icon,0"
                }
                $s.Save()
                if (Test-Path -LiteralPath $path) { return $path }
            } catch {
                $script:lastError = $_.Exception.Message
            }
        }
    }

    # No .lnk could be written. A .cmd on the Desktop is double-clickable too.
    foreach ($name in @('הפתרון המבריק - פרסום.cmd', 'Hapitaron Publish.cmd')) {
        $path = Join-Path $Dir $name
        try {
            $body = "@echo off`r`ncd /d `"$repo`"`r`ncall `"$target`"`r`n"
            [IO.File]::WriteAllText($path, $body, [Text.Encoding]::ASCII)
            if (Test-Path -LiteralPath $path) { return $path }
        } catch {
            $script:lastError = $_.Exception.Message
        }
    }
    return $null
}

$desktop = Resolve-Dir @(
    [Environment]::GetFolderPath('DesktopDirectory'),
    [Environment]::GetFolderPath('Desktop'),
    (Join-Path $env:USERPROFILE 'Desktop')
)

$link = if ($desktop) { New-Launcher $desktop } else { $null }

if (-not $link) {
    Write-Host ''
    Write-Host '  [!] לא הצלחתי ליצור את הסמל על שולחן העבודה.' -ForegroundColor Red
    Write-Host "      ניסיתי כאן: $desktop"
    if ($script:lastError) { Write-Host "      השגיאה: $script:lastError" -ForegroundColor DarkGray }
    Write-Host ''
    Write-Host '      פתרון ידני: הריצו   explorer .   ואז קליק ימני על'
    Write-Host '      start-worker.cmd ובחרו ליצור קיצור דרך, וגררו אותו לשולחן העבודה.'
    Write-Host ''
    exit 1
}

Write-Host ''
Write-Host '  ============================================' -ForegroundColor Green
Write-Host '    מוכן. יש לכם סמל על שולחן העבודה:' -ForegroundColor Green
Write-Host ("      " + [IO.Path]::GetFileNameWithoutExtension($link)) -ForegroundColor Green
Write-Host '  ============================================' -ForegroundColor Green
Write-Host ''
Write-Host '  מהיום: לחיצה כפולה על הסמל - וזהו.'
Write-Host ''
# Printed in full because the Desktop can be redirected into OneDrive under a
# localised name; if the icon is not where expected, this line says where it is.
Write-Host ("  נוצר כאן: " + $link) -ForegroundColor DarkGray
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
    $startup = Resolve-Dir @(
        [Environment]::GetFolderPath('Startup'),
        (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Startup')
    )
    $auto = if ($startup) { New-Launcher $startup } else { $null }
    Write-Host ''
    if ($auto) {
        Write-Host '  נוסף. מעכשיו התוכנה עולה יחד עם המחשב.' -ForegroundColor Green
        Write-Host ''
        Write-Host '  לביטול בעתיד: Win+R, להקליד shell:startup, ולמחוק משם את הסמל.'
        Write-Host '  שימו לב: המחשב צריך להישאר דלוק (לא במצב שינה) בשעות ההפצה.'
    } else {
        Write-Host '  [!] הסמל בשולחן העבודה נוצר, אבל ההפעלה האוטומטית נכשלה.' -ForegroundColor Yellow
        Write-Host '      אפשר להוסיף ידנית: Win+R, shell:startup, ולגרור לשם עותק של הסמל.'
    }
}

Write-Host ''
