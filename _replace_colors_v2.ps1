param([string]$Dir)

$files = Get-ChildItem -Path $Dir -Recurse -Include '*.tsx','*.css','*.ts' | Where-Object { $_.FullName -notmatch 'node_modules|\\\.next|build|_replace' }

foreach ($f in $files) {
    $content = Get-Content -Path $f.FullName | Out-String
    $original = $content
    $content = $content -replace '#E8B8C2', '#D4A574'
    $content = $content -replace '#e8b8c2', '#d4a574'
    $content = $content -replace '#F5DCE0', '#F0DEC4'
    $content = $content -replace '#f5dce0', '#f0dec4'
    $content = $content -replace '#D86F82', '#C4845A'
    $content = $content -replace '#d86f82', '#c4845a'
    if ($content -ne $original) {
        $content | Set-Content -Path $f.FullName -Encoding UTF8
        Write-Host "Modified: $($f.FullName)"
    }
}

Write-Host "Done."
