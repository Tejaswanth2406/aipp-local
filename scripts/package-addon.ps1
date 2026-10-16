# scripts/package-addon.ps1 — Package AIPP Local as a Firefox .xpi / .zip add-on
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
Add-Type -AssemblyName "System.IO.Compression"
Add-Type -AssemblyName "System.IO.Compression.FileSystem"

$root = Resolve-Path "."
$manifest = Get-Content (Join-Path $root "manifest.json") -Raw | ConvertFrom-Json
$version = $manifest.version
$xpiPath = Join-Path $dist "aipp-local-$version.xpi"
$zipPath = Join-Path $dist "aipp-local-$version.zip"
$zipV2Path = Join-Path $dist "aipp-local-v2.zip"
$zipVersion2Path = Join-Path $dist "aipp-local-version-2.zip"

if (Test-Path $dist) {
    Remove-Item -Path $dist -Recurse -Force
}
New-Item -ItemType Directory -Path $dist | Out-Null

Write-Host "Creating extension distribution package..." -ForegroundColor Cyan

# Only runtime extension files are packaged (no documentation/markdown files)
$filesToInclude = @(
    "manifest.json"
)

$dirsToInclude = @(
    "src",
    "rules",
    "models",
    "icons"
)

$tempStage = Join-Path $dist "stage"
New-Item -ItemType Directory -Path $tempStage | Out-Null

foreach ($f in $filesToInclude) {
    Copy-Item (Join-Path $root $f) (Join-Path $tempStage $f)
}
foreach ($d in $dirsToInclude) {
    Copy-Item (Join-Path $root $d) (Join-Path $tempStage $d) -Recurse
}

# Zip using .NET ZipArchive with forward slash (/) entry names.
# AMO (Mozilla Add-ons) validator strictly requires forward slashes per the ZIP spec (PKWARE APPNOTE 4.4.17.1).
# Backslashes (\) result in "Invalid file name in archive: icons\icon-128.png".
$zip = [System.IO.Compression.ZipFile]::Open($zipPath, [System.IO.Compression.ZipArchiveMode]::Create)
try {
    $items = Get-ChildItem -Path $tempStage -Recurse -File
    foreach ($item in $items) {
        $relativePath = $item.FullName.Substring($tempStage.Length).TrimStart('\', '/')
        $entryName = $relativePath.Replace('\', '/')
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $item.FullName, $entryName, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
    }
}
finally {
    $zip.Dispose()
}

Copy-Item $zipPath $xpiPath -Force
Copy-Item $zipPath $zipV2Path -Force
Copy-Item $zipPath $zipVersion2Path -Force
Remove-Item -Path $tempStage -Recurse -Force

$size = (Get-Item $xpiPath).Length
Write-Host "Successfully built: $xpiPath ($size bytes)" -ForegroundColor Green
Write-Host "Generated primary zip: $zipPath" -ForegroundColor Green
Write-Host "Generated version 2 aliases: $zipV2Path, $zipVersion2Path" -ForegroundColor Green
Write-Host "`nTo load into Firefox:" -ForegroundColor Yellow
Write-Host "1. Open Firefox and navigate to about:debugging"
Write-Host "2. Click 'This Firefox' on the left menu"
Write-Host "3. Click 'Load Temporary Add-on...'"
Write-Host "4. Select manifest.json in the project root or $xpiPath"
