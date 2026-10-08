# Unit-test executables do not inherit Tauri's application manifest. The dialog
# dependency imports TaskDialogIndirect, which requires Common Controls v6.
$ErrorActionPreference = 'Stop'
$workspace = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
Push-Location $workspace
try {
    $artifacts = & cargo test --manifest-path src-tauri/Cargo.toml --lib --no-run --message-format=json
    if ($LASTEXITCODE -ne 0) { throw 'Rust test compilation failed' }
    $testExe = $artifacts | ForEach-Object {
        try { $record = $_ | ConvertFrom-Json } catch { return }
        if ($record.reason -eq 'compiler-artifact' -and $record.profile.test -and $record.target.name -eq 'hiviewer_lib') { $record.executable }
    } | Select-Object -Last 1
    if (!$testExe) { throw 'Test executable missing' }
    $resolvedExe = (Resolve-Path -LiteralPath $testExe).Path
    if (!$resolvedExe.StartsWith((Join-Path $workspace 'src-tauri/target'), [StringComparison]::OrdinalIgnoreCase)) { throw 'Test executable outside workspace target' }
    $manifestTool = Get-ChildItem 'C:/Program Files (x86)/Windows Kits/10/bin' -Filter mt.exe -Recurse | Where-Object { $_.Directory.Name -eq 'x64' } | Sort-Object FullName | Select-Object -Last 1
    if (!$manifestTool) { throw 'Windows SDK mt.exe is required to embed the test manifest' }
    & $manifestTool.FullName -nologo -manifest (Join-Path $PSScriptRoot 'test-controls.manifest') "-outputresource:$resolvedExe;#1"
    if ($LASTEXITCODE -ne 0) { throw 'Could not embed Common Controls test manifest' }
    & $resolvedExe 'plugins' '--nocapture' '--test-threads=1'
    if ($LASTEXITCODE -ne 0) { throw 'Plugin tests failed' }
} finally { Pop-Location }
