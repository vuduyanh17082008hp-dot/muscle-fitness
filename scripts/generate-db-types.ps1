param(
  [Parameter(Mandatory = $true)]
  [string]$ProjectRef
)

$ErrorActionPreference = 'Stop'

New-Item `
  -ItemType Directory `
  -Force `
  'src/types' |
  Out-Null

npx supabase gen types typescript `
  --project-id $ProjectRef `
  --schema public |
  Set-Content `
    -Encoding utf8 `
    'src/types/database.types.ts'

Write-Host `
  'Generated src/types/database.types.ts' `
  -ForegroundColor Green