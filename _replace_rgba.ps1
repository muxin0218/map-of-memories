$files = Get-ChildItem -Path 'd:\MyDownload\mapofus\map-of-us-template\components' -Include '*.tsx' | Where-Object { $_.FullName -notmatch 'build|_replace' }

foreach ($f in $files) {
    $content = Get-Content -Path $f.FullName -Raw
    $original = $content
    $content = $content -replace '232,184,194', '212,165,116'
    $content = $content -replace '245,220,224', '240,222,196'
    $content = $content -replace '216,111,130', '196,132,90'
    if ($content -ne $original) {
        Set-Content -Path $f.FullName -Value $content -NoNewline
        Write-Host "Modified: $($f.FullName)"
    }
}

Write-Host "Done."
