param(
    [string]$Repositorio = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Stop'
$archivos = @(
    'README.md',
    '.gitignore',
    '.github/workflows/mobsf.yml',
    'docs/felipe/entrega-8-seguridad.md',
    'security/reports/audit-web.json',
    'security/reports/audit-supabase.json',
    'supabase/package.json',
    'supabase/package-lock.json',
    'supabase/tools/test-local.mjs',
    'scripts/subir-entrega8-felipe.ps1'
)

Push-Location $Repositorio
try {
    $raizGit = (git rev-parse --show-toplevel).Trim().Replace('/', '\').TrimEnd('\')
    $raizElegida = (Resolve-Path $Repositorio).Path.TrimEnd('\')
    if ($raizGit -ine $raizElegida) {
        throw 'La ruta no corresponde a la raíz del repositorio ConectaSur.'
    }
    if ((git branch --show-current).Trim() -ne 'main') {
        throw 'Abre la carpeta clonada en la rama main antes de ejecutar este script.'
    }
    $permitidos = @{}
    foreach ($archivo in $archivos) { $permitidos[$archivo.Replace('/', '\')] = $true }
    foreach ($linea in (git status --porcelain --untracked-files=all)) {
        $ruta = $linea.Substring(3).Trim().Replace('/', '\')
        if (-not $permitidos.ContainsKey($ruta)) {
            throw "Hay un cambio ajeno a esta entrega ($ruta). Guárdalo aparte para no mezclarlo."
        }
    }

    git pull --ff-only origin main
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo actualizar main sin crear un merge.' }

    git add -- $archivos
    if ($LASTEXITCODE -ne 0) { throw 'No se pudieron preparar los archivos de Entrega 8.' }
    git diff --cached --quiet
    if ($LASTEXITCODE -eq 0) {
        Write-Host 'No hay cambios pendientes de Felipe para subir; main ya está al día.'
        return
    }

    git diff --cached --check
    if ($LASTEXITCODE -ne 0) { throw 'La revisión encontró espacios o conflictos en los cambios.' }
    git commit -m 'Entrega 8 (Felipe): informe y pruebas de seguridad'
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo crear el commit.' }
    git push origin main
    if ($LASTEXITCODE -ne 0) { throw 'El commit quedó en main local pero no se pudo subir. Revisa GitHub y vuelve a ejecutar.' }

    Write-Host 'La parte de Felipe quedó subida directamente a origin/main.'
}
finally {
    Pop-Location
}
