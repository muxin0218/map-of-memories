param([string]$Dir)

# Fix rgb() format references in globals.css
$cssPath = Join-Path $Dir "app\globals.css"
$content = [System.IO.File]::ReadAllText($cssPath, [System.Text.Encoding]::UTF8)
$original = $content
$content = $content -replace 'rgb\(245 220 224', 'rgb(240 222 196'
$content = $content -replace 'rgb\(216 111 130', 'rgb(196 132 90'
$content = $content -replace 'rgb\(232 184 194', 'rgb(212 165 116'

if ($content -ne $original) {
    [System.IO.File]::WriteAllText($cssPath, $content, [System.Text.Encoding]::UTF8)
    Write-Host "Fixed CSS file."
}

# Fix rgba() in ProvinceMap.tsx
$provinceMapPath = Join-Path $Dir "components\ProvinceMap.tsx"
$content = [System.IO.File]::ReadAllText($provinceMapPath, [System.Text.Encoding]::UTF8)
$original = $content
$content = $content -replace '232,184,194', '212,165,116'
$content = $content -replace '245,220,224', '240,222,196'
if ($content -ne $original) {
    [System.IO.File]::WriteAllText($provinceMapPath, $content, [System.Text.Encoding]::UTF8)
    Write-Host "Fixed ProvinceMap.tsx"
}

# Fix rgba() in HomeProgress.tsx
$homeProgressPath = Join-Path $Dir "components\HomeProgress.tsx"
$content = [System.IO.File]::ReadAllText($homeProgressPath, [System.Text.Encoding]::UTF8)
$original = $content
$content = $content -replace '232,184,194', '212,165,116'
if ($content -ne $original) {
    [System.IO.File]::WriteAllText($homeProgressPath, $content, [System.Text.Encoding]::UTF8)
    Write-Host "Fixed HomeProgress.tsx"
}

Write-Host "Done."
