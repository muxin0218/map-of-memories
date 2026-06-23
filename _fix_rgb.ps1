param([string]$Dir)

# Fix rgb() format references in globals.css
$cssPath = Join-Path $Dir "app\globals.css"
$content = Get-Content $cssPath -Raw
$original = $content
$content = $content -replace 'rgb\(245 220 224', 'rgb(240 222 196'
$content = $content -replace 'rgb\(216 111 130', 'rgb(196 132 90'
$content = $content -replace 'rgb\(232 184 194', 'rgb(212 165 116'

if ($content -ne $original) {
    [System.IO.File]::WriteAllText($cssPath, $content, [System.Text.UTF8Encoding]::new($false))
    Write-Host "Fixed CSS file."
}

# Fix rgba() in component files
$componentPatterns = @(
    @{File="\ProvinceMap.tsx"; Old="232,184,194"; New="212,165,116"},
    @{File="\ProvinceMap.tsx"; Old="245,220,224"; New="240,222,196"},
    @{File="\HomeProgress.tsx"; Old="232,184,194"; New="212,165,116"}
)

$componentDir = Join-Path $Dir "components"
foreach ($pat in $componentPatterns) {
    $path = Join-Path $componentDir $pat.File
    if (Test-Path $path) {
        $content = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
        $original = $content
        $content = $content -replace $pat.Old, $pat.New
        if ($content -ne $original) {
            [System.IO.File]::WriteAllText($path, $content, [System.Text.Encoding]::UTF8)
            Write-Host "Fixed $($pat.File)"
        }
    }
}

Write-Host "Done."
