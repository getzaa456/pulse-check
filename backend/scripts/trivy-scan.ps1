param(
  [string]$Image = "pulse-check:local"
)

$ErrorActionPreference = "Stop"

if (Get-Command trivy -ErrorAction SilentlyContinue) {
  trivy image `
    --exit-code 1 `
    --severity HIGH,CRITICAL `
    --ignore-unfixed `
    --scanners vuln `
    $Image
  exit $LASTEXITCODE
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw "Neither Trivy nor Docker is available in PATH."
}

docker run --rm `
  -v /var/run/docker.sock:/var/run/docker.sock `
  aquasec/trivy:latest image `
  --exit-code 1 `
  --severity HIGH,CRITICAL `
  --ignore-unfixed `
  --scanners vuln `
  $Image

exit $LASTEXITCODE
