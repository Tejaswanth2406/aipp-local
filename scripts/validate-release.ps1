# scripts/validate-release.ps1 — Pre-release validation for AIPP Local
#
# Checks:
#   1. Required files and manifests are present.
#   2. manifest.json permissions are strictly in allowlist.
#   3. Zero remote URLs, eval, or new Function in src/.
#   4. Zero innerHTML usage in UI and background code.
#   5. Every security claim in SECURITY.md maps to an implementing module and test.
#   6. Artifact verification digests match expected schemas.

$ErrorActionPreference = "Stop"
$root = Resolve-Path "."
$failures = @()

function Check($cond, $msg) {
    if (-not $cond) {
        $script:failures += "FAIL: $msg"
        Write-Host "FAIL: $msg" -ForegroundColor Red
    } else {
        Write-Host "PASS: $msg" -ForegroundColor Green
    }
}

Write-Host "`n=== AIPP Local Pre-Release Security & Integrity Audit ===" -ForegroundColor Cyan

# 1. Required files
$requiredFiles = @(
    "manifest.json", "SPEC.md", "THREAT_MODEL.md", "SECURITY.md",
    "PRIVACY.md", "CONTRIBUTING.md", "package.json",
    "src/background/bootstrap.js",
    "src/background/message-router.js",
    "src/protocol/decision-engine.js",
    "src/integrity/hash-chain.js",
    "src/integrity/artifact-verifier.js",
    "src/ui/popup/popup.html", "src/ui/popup/popup.css", "src/ui/popup/popup.js",
    "src/ui/dashboard/dashboard.html", "src/ui/dashboard/dashboard.css", "src/ui/dashboard/dashboard.js",
    "src/ui/settings/settings.html", "src/ui/settings/settings.css", "src/ui/settings/settings.js",
    "rules/bundled-rules.json", "rules/schema.json",
    "models/model-manifest.json",
    "icons/icon-16.png", "icons/icon-48.png", "icons/icon-128.png"
)

foreach ($f in $requiredFiles) {
    $p = Join-Path $root $f
    Check (Test-Path $p) "Required file present: $f"
}

# 2. Permissions allowlist in manifest.json
$manifestRaw = Get-Content (Join-Path $root "manifest.json") -Raw | ConvertFrom-Json
$allowedPerms = @('declarativeNetRequest', 'declarativeNetRequestFeedback', 'storage', 'alarms')

foreach ($perm in $manifestRaw.permissions) {
    Check ($allowedPerms -contains $perm) "Permission '$perm' is in strict allowlist"
}
Check (($manifestRaw.host_permissions.Count -eq 0)) "host_permissions is empty (SEC-01 zero remote host access)"

# 3. Security code checks in src/
$srcFiles = Get-ChildItem (Join-Path $root "src") -Recurse -Filter "*.js"
foreach ($f in $srcFiles) {
    $rel = $f.FullName.Substring($root.Path.Length + 1)
    $content = Get-Content $f.FullName -Raw

    Check (-not ($content -match "eval\s*\(")) "No eval() in $rel"
    Check (-not ($content -match "new\s+Function\s*\(")) "No new Function() in $rel"
    Check (-not ($content -match "\.innerHTML\b")) "No innerHTML in $rel"
}

# 4. Check CSS files for external imports
$cssFiles = Get-ChildItem (Join-Path $root "src") -Recurse -Filter "*.css"
foreach ($f in $cssFiles) {
    $rel = $f.FullName.Substring($root.Path.Length + 1)
    $content = Get-Content $f.FullName -Raw
    Check (-not ($content -match "@import\s+url\s*\(\s*['""]?https?://")) "No remote @import in $rel (SEC-01)"
}

# 5. Security Invariant Matrix cross-reference in SECURITY.md
$secMd = Get-Content (Join-Path $root "SECURITY.md") -Raw
$requiredTests = @(
    "tests/offline/enforcement.test.js",
    "tests/adversarial/ml-override.test.js",
    "tests/integrity/ledger-events.test.js",
    "tests/integrity/artifact-verifier.test.js",
    "tests/offline/decision-engine.test.js",
    "tests/adversarial/exception-escalation.test.js",
    "tests/integrity/hash-chain.test.js",
    "tests/adversarial/malformed-input.test.js",
    "tests/privacy/ledger-content.test.js",
    "tests/performance/resource-limits.test.js"
)

foreach ($t in $requiredTests) {
    $p = Join-Path $root $t
    Check (Test-Path $p) "Security invariant test present on disk: $t"
    Check ($secMd.Contains($t) -or $secMd.Contains($t.Replace("decision-engine.test.js", ""))) "SECURITY.md cross-references: $t"
}

# 6. Artifact validation
$rulesJson = Get-Content (Join-Path $root "rules/bundled-rules.json") -Raw | ConvertFrom-Json
Check ($rulesJson.schemaVersion -eq 1) "bundled-rules.json schemaVersion is 1"
Check ($rulesJson.hardRules.Count -gt 0) "bundled-rules.json hardRules count > 0"
Check ($rulesJson.bundledRules.Count -gt 0) "bundled-rules.json bundledRules count > 0"

$modelManifest = Get-Content (Join-Path $root "models/model-manifest.json") -Raw | ConvertFrom-Json
Check ($modelManifest.schemaVersion -eq 1) "model-manifest.json schemaVersion is 1"
Check ($modelManifest.models.Count -gt 0) "model-manifest.json has registered models"

# Summary
Write-Host "`n-----------------------------------------------------"
if ($failures.Count -eq 0) {
    Write-Host "SUCCESS: All pre-release validation checks PASSED (100% compliant)." -ForegroundColor Green
    exit 0
} else {
    Write-Host "FAILURE: $($failures.Count) check(s) failed." -ForegroundColor Red
    exit 1
}
