[CmdletBinding()]
param(
  [string]$ProjectDir = "",
  [string]$ComposeFile = ""
)

$ErrorActionPreference = "Continue"
$PSNativeCommandUseErrorActionPreference = $false
$ScriptRoot = if ([string]::IsNullOrWhiteSpace($PSScriptRoot)) {
  Split-Path -Parent $MyInvocation.MyCommand.Path
} else {
  $PSScriptRoot
}

if ([string]::IsNullOrWhiteSpace($ProjectDir)) {
  $ProjectDir = (Resolve-Path (Join-Path $ScriptRoot "..")).Path
}

if ([string]::IsNullOrWhiteSpace($ComposeFile)) {
  $ComposeFile = Join-Path $ProjectDir "docker-compose.yml"
}

docker version *> $null
if ($LASTEXITCODE -ne 0) {
  throw "Docker is required for the PostgreSQL 18 upgrade."
}

function Get-DotEnvValue {
  param(
    [string]$Key,
    [string]$Default
  )

  $current = [Environment]::GetEnvironmentVariable($Key)
  if (-not [string]::IsNullOrWhiteSpace($current)) {
    return $current
  }

  $envFile = Join-Path $ProjectDir ".env"
  if (Test-Path $envFile) {
    $pattern = "^\s*$([regex]::Escape($Key))="
    $line = Get-Content $envFile | Where-Object { $_ -match $pattern } | Select-Object -Last 1
    if ($line) {
      $value = ($line -split "=", 2)[1].Trim()
      if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
        $value = $value.Substring(1, $value.Length - 2)
      }
      return $value
    }
  }

  return $Default
}

function Test-DockerVolume {
  param([string]$Name)

  docker volume inspect $Name *> $null
  return $LASTEXITCODE -eq 0
}

function Get-VolumePgVersion {
  param(
    [string]$Volume,
    [string]$MountPath,
    [string]$VersionPath,
    [string]$Image
  )

  $result = docker run --rm -v "${Volume}:${MountPath}" --entrypoint sh $Image -c "cat '$VersionPath' 2>/dev/null || true"
  if ($LASTEXITCODE -ne 0) {
    return ""
  }

  return ($result -join "").Trim()
}

function Wait-PostgresReady {
  param([string]$Container)

  for ($attempt = 1; $attempt -le 60; $attempt++) {
    docker exec $Container pg_isready -U $PostgresUser -d $PostgresDb *> $null
    if ($LASTEXITCODE -eq 0) {
      return
    }
    Start-Sleep -Seconds 1
  }

  docker logs $Container
  throw "PostgreSQL did not become ready in container $Container."
}

function Stop-AppServices {
  $services = docker compose --project-directory $ProjectDir -f $ComposeFile config --services 2>$null
  foreach ($service in @("caddy", "frontend", "backend")) {
    if ($services -contains $service) {
      docker compose --project-directory $ProjectDir -f $ComposeFile stop $service *> $null
    }
  }
}

$ProjectName = Get-DotEnvValue "COMPOSE_PROJECT_NAME" "pixelproject"
$PostgresDb = Get-DotEnvValue "POSTGRES_DB" "pixelproject"
$PostgresUser = Get-DotEnvValue "POSTGRES_USER" "pixelproject"
$PostgresPassword = Get-DotEnvValue "POSTGRES_PASSWORD" "pixelproject"
$OldVolume = Get-DotEnvValue "POSTGRES_16_VOLUME" "${ProjectName}_postgres_data"
$NewVolume = Get-DotEnvValue "POSTGRES_18_VOLUME" "${ProjectName}_postgres18_data"
$OldImage = Get-DotEnvValue "POSTGRES_16_IMAGE" "postgres:16-alpine"
$NewImage = Get-DotEnvValue "POSTGRES_18_IMAGE" "postgres:18-alpine"
$BackupDir = Get-DotEnvValue "POSTGRES_UPGRADE_BACKUP_DIR" (Join-Path $ProjectDir "backups\postgres-major-upgrade")
$OldTempContainer = ""
$NewTempContainer = ""

try {
  $targetVersion = Get-VolumePgVersion $NewVolume "/var/lib/postgresql" "/var/lib/postgresql/18/docker/PG_VERSION" $NewImage
  if ($targetVersion -eq "18") {
    Write-Host "PostgreSQL 18 volume $NewVolume is already initialized; skipping major upgrade."
    exit 0
  }

  if (-not (Test-DockerVolume $OldVolume)) {
    Write-Host "Legacy PostgreSQL 16 volume $OldVolume does not exist; a fresh PostgreSQL 18 volume will be initialized by compose."
    exit 0
  }

  $oldVersion = Get-VolumePgVersion $OldVolume "/var/lib/postgresql/data" "/var/lib/postgresql/data/PG_VERSION" $OldImage
  if ($oldVersion -ne "16") {
    Write-Host "Legacy volume $OldVolume is not a PostgreSQL 16 data directory; a fresh PostgreSQL 18 volume will be initialized by compose."
    exit 0
  }

  $targetEntries = docker run --rm -v "${NewVolume}:/var/lib/postgresql" --entrypoint sh $NewImage -c "find /var/lib/postgresql -mindepth 1 -maxdepth 3 ! -path '/var/lib/postgresql/lost+found*' | head -n 1" 2>$null
  if (-not [string]::IsNullOrWhiteSpace(($targetEntries -join ""))) {
    throw "Target PostgreSQL 18 volume $NewVolume is not empty but has no PG18 marker. Refusing to overwrite it."
  }

  New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
  $timestamp = (Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmssZ")
  $DumpFile = Join-Path $BackupDir "${PostgresDb}_pg16_to_pg18_${timestamp}.sql"

  Write-Host "Preparing PostgreSQL 16 -> 18 upgrade."
  Write-Host "Old volume: $OldVolume"
  Write-Host "New volume: $NewVolume"
  Write-Host "Backup dump: $DumpFile"

  Stop-AppServices

  $oldContainer = docker ps --filter "label=com.docker.compose.project=$ProjectName" --filter "label=com.docker.compose.service=db" --format "{{.ID}}" | Select-Object -First 1
  $oldWasTemp = $false

  if ([string]::IsNullOrWhiteSpace($oldContainer)) {
    $OldTempContainer = "${ProjectName}-postgres16-upgrade"
    docker rm -f $OldTempContainer *> $null
    docker run -d --name $OldTempContainer -e "POSTGRES_DB=$PostgresDb" -e "POSTGRES_USER=$PostgresUser" -e "POSTGRES_PASSWORD=$PostgresPassword" -v "${OldVolume}:/var/lib/postgresql/data" $OldImage *> $null
    $oldContainer = $OldTempContainer
    $oldWasTemp = $true
  }

  Wait-PostgresReady $oldContainer
  docker exec $oldContainer sh -c "pg_dump --no-owner --no-acl -U '$PostgresUser' -d '$PostgresDb' > /tmp/pixelproject-pg16.sql"
  if ($LASTEXITCODE -ne 0) {
    throw "PostgreSQL 16 dump failed."
  }
  docker cp "${oldContainer}:/tmp/pixelproject-pg16.sql" $DumpFile

  if ($oldWasTemp) {
    docker rm -f $OldTempContainer *> $null
    $OldTempContainer = ""
  }

  $NewTempContainer = "${ProjectName}-postgres18-upgrade"
  docker rm -f $NewTempContainer *> $null
  docker run -d --name $NewTempContainer -e "POSTGRES_DB=$PostgresDb" -e "POSTGRES_USER=$PostgresUser" -e "POSTGRES_PASSWORD=$PostgresPassword" -v "${NewVolume}:/var/lib/postgresql" $NewImage *> $null

  Wait-PostgresReady $NewTempContainer
  docker cp $DumpFile "${NewTempContainer}:/tmp/pixelproject-pg16.sql"
  docker exec $NewTempContainer psql -v ON_ERROR_STOP=1 -U $PostgresUser -d $PostgresDb -f /tmp/pixelproject-pg16.sql
  if ($LASTEXITCODE -ne 0) {
    throw "PostgreSQL 18 restore failed."
  }

  $serverVersionNum = (docker exec $NewTempContainer psql -U $PostgresUser -d $PostgresDb -tAc "SHOW server_version_num" | Select-Object -First 1).Trim()
  if (-not $serverVersionNum.StartsWith("18")) {
    throw "Restored database is not running PostgreSQL 18; server_version_num=$serverVersionNum."
  }

  $tableCount = (docker exec $NewTempContainer psql -U $PostgresUser -d $PostgresDb -tAc "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'" | Select-Object -First 1).Trim()
  if ($tableCount -eq "0") {
    throw "Restore finished with zero public tables. Refusing to switch volumes."
  }

  if (-not $oldWasTemp -and -not [string]::IsNullOrWhiteSpace($oldContainer)) {
    docker stop $oldContainer *> $null
  }

  docker rm -f $NewTempContainer *> $null
  $NewTempContainer = ""
  Write-Host "PostgreSQL 18 upgrade completed. Safety dump: $DumpFile"
} finally {
  if (-not [string]::IsNullOrWhiteSpace($OldTempContainer)) {
    docker rm -f $OldTempContainer *> $null
  }
  if (-not [string]::IsNullOrWhiteSpace($NewTempContainer)) {
    docker rm -f $NewTempContainer *> $null
  }
}
