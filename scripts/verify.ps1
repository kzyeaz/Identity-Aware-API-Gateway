$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Push-Location $root
try {
    npm.cmd ci
    if ($LASTEXITCODE -ne 0) { throw "npm ci failed" }
    npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw "Build failed" }
    npm.cmd test
    if ($LASTEXITCODE -ne 0) { throw "TypeScript tests failed" }
    $maven = Get-Command mvn.cmd -ErrorAction SilentlyContinue
    if ($maven) { & $maven.Source -B -ntp verify }
    elseif (Test-Path ".tools/apache-maven-3.9.11/bin/mvn.cmd") { & ".tools/apache-maven-3.9.11/bin/mvn.cmd" -B -ntp verify }
    else { throw "Install Maven 3.9+ and JDK 17+, then run mvn verify. Docker must be running for Testcontainers." }
    if ($LASTEXITCODE -ne 0) { throw "Java verification failed" }
    npm.cmd audit --audit-level=high
    if ($LASTEXITCODE -ne 0) { throw "Dependency scan failed" }
} finally { Pop-Location }
