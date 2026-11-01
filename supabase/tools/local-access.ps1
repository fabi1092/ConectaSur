param(
    [ValidateSet("accounts","migrate","seed","photos","test")][string]$Action="accounts"
)
$ErrorActionPreference="Stop"
$privatePath=Join-Path $env:USERPROFILE ".codex/secrets/conectasur-supabase.dpapi"
$secure=(Get-Content -LiteralPath $privatePath -Raw).Trim() | ConvertTo-SecureString
$plain=[System.Net.NetworkCredential]::new("",$secure).Password
$config=$plain | ConvertFrom-Json
if($Action -eq "accounts"){
    $config.accounts.PSObject.Properties | ForEach-Object {
        [PSCustomObject]@{Cuenta=$_.Name;Correo=$_.Value.email;Clave=$_.Value.password}
    } | Format-Table -AutoSize
    exit
}
$repo=Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$node=(Get-Command node).Source
# Usar Node >=24.12; no cambia la instalacion global.
if([version]((& $node -p "process.versions.node").Trim()) -lt [version]"24.12.0"){throw "Usa Node >=24.12.0 en PATH"}
$env:CONECTASUR_PRIVATE=$plain
$pendingPath=Join-Path $env:USERPROFILE ".codex/secrets/conectasur-supabase.pending.json"
if($Action -eq "seed"){$env:CONECTASUR_PRIVATE_OUTPUT=$pendingPath}
Push-Location $repo
try{
    if($Action -eq "test"){
        & $node --test --test-concurrency=1 supabase/test/security.test.js supabase/test/web.test.js
    }else{
        & $node supabase/tools/admin.mjs $Action
    }
    $result=$LASTEXITCODE
}finally{
    if($Action -eq "seed" -and (Test-Path -LiteralPath $pendingPath)){
        (Get-Content -LiteralPath $pendingPath -Raw) | ConvertTo-SecureString -AsPlainText -Force | ConvertFrom-SecureString |
            Set-Content -LiteralPath $privatePath -Encoding UTF8
        Remove-Item -LiteralPath $pendingPath
    }
    Remove-Item Env:CONECTASUR_PRIVATE -ErrorAction SilentlyContinue
    Remove-Item Env:CONECTASUR_PRIVATE_OUTPUT -ErrorAction SilentlyContinue
    Pop-Location
}
exit $result
