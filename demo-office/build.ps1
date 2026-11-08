param(
  [Parameter(Mandatory = $true)][string]$Domain,
  [string]$OfficeGmail = "",
  [Parameter(Mandatory = $true)][string]$UploadUrl
)

$ErrorActionPreference = "Stop"

$Domain = (($Domain.Trim().ToLower() -replace '^https?://', '') -replace '/.*$', '') -replace '^www\.', ''
$OfficeGmail = $OfficeGmail.Trim().ToLower()
$UploadUrl = $UploadUrl.Trim().TrimEnd('/')

if ($Domain -notmatch '^[a-z0-9-]+(\.[a-z0-9-]+)+$') { throw "Domain looks wrong: $Domain" }
if ($OfficeGmail -and $OfficeGmail -notmatch '^[a-z0-9.+_-]+@gmail\.com$') { throw "OfficeGmail must be a @gmail.com address" }
if ($UploadUrl -notmatch '^https://[^\s|]+$') { throw "UploadUrl must start with https://" }

$src = Join-Path $PSScriptRoot "site"
$out = Join-Path $PSScriptRoot "dist"
if (Test-Path $out) { Remove-Item $out -Recurse -Force }
Copy-Item $src $out -Recurse

$utf8 = New-Object System.Text.UTF8Encoding($false)
Get-ChildItem $out -Recurse -File -Force | ForEach-Object {
  $text = [IO.File]::ReadAllText($_.FullName)
  $new = $text.Replace('{{DOMAIN}}', $Domain).Replace('{{OFFICE_GMAIL}}', $OfficeGmail).Replace('{{UPLOAD_URL}}', $UploadUrl)
  if ($new -ne $text) { [IO.File]::WriteAllText($_.FullName, $new, $utf8) }
}

$all = ((Get-ChildItem $out -Recurse -File -Force | ForEach-Object { [IO.File]::ReadAllText($_.FullName) }) -join "`n").ToLower()
if ($all.Contains('{{')) { throw "A placeholder was not replaced" }
$squashed = $all -replace '[^a-z0-9]', ''
foreach ($bad in @('5550142', 'maplestreettaxdocs', 'maplestreettaxhelp')) {
  if ($squashed.Contains($bad)) { throw "'$bad' belongs to the training sample and must never appear on the office site" }
}

$key = Join-Path $out ".well-known\handoff.json"
if ([IO.File]::ReadAllText($key).Contains('"placeholder"')) {
  Write-Warning "demo-office\site\.well-known\handoff.json is still the placeholder. Replace it with the file from the office dashboard and build again."
}

Write-Host "Built $out for https://$Domain (office Gmail $OfficeGmail, upload -> $UploadUrl)"
