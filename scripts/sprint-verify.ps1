$ErrorActionPreference = 'Stop'

function Invoke-Step {
  param(
    [Parameter(Mandatory = $true)]
    [string] $Name,
    [Parameter(Mandatory = $true)]
    [scriptblock] $Command
  )

  & $Command
  if ($LASTEXITCODE -ne 0) {
    throw "FAIL: $Name"
  }
}

try {
  Invoke-Step 'Backend TS' { npx tsc --noEmit -p backend/tsconfig.json }
  Invoke-Step 'Frontend TS' { npx tsc --noEmit -p frontend/tsconfig.json }
  Invoke-Step 'ESLint' { npm run lint }
  Invoke-Step 'Tests' { npm run test }
  Invoke-Step 'Coverage' { npm run test:coverage }
  Invoke-Step 'Build' { npm run build }
  Invoke-Step 'Secret scan' { node scripts/check-no-secrets-in-build.js }
  Invoke-Step 'Docker build' { docker compose build }

  docker compose up -d
  Start-Sleep -Seconds 15

  Invoke-WebRequest -UseBasicParsing http://localhost:8080 | Out-Null
  Invoke-WebRequest -UseBasicParsing http://localhost:8080/api/ready | Out-Null

  docker compose down
  Write-Output '=== ALL GATES PASSED ==='
} catch {
  docker compose down 2>$null
  Write-Error $_
  exit 1
}
