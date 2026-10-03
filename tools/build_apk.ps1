# Reconstruit l'APK de test : copie www/ dans le projet Android puis compile.
# Usage : powershell -File tools/build_apk.ps1   ->  dist/Odysseum.apk
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$env:Path = "C:\Program Files\nodejs;" + $env:Path
$env:JAVA_HOME = (Get-ChildItem "C:\Program Files\Eclipse Adoptium" -Directory | Select-Object -First 1).FullName
$env:ANDROID_HOME = "C:\Android\sdk"
$env:ANDROID_SDK_ROOT = "C:\Android\sdk"
# Java échoue sous Windows si le dossier temporaire a un chemin trop long
New-Item -ItemType Directory -Force C:\gtmp | Out-Null
$env:TEMP = "C:\gtmp"; $env:TMP = "C:\gtmp"
$env:JAVA_TOOL_OPTIONS = "-Djava.io.tmpdir=C:\gtmp -Djdk.net.unixdomain.tmpdir=C:\gtmp"

Push-Location $root
npx cap sync android
Pop-Location

$android = Join-Path $root 'android'
$p = Start-Process -FilePath "$android\gradlew.bat" -ArgumentList 'assembleDebug', '--no-daemon', '-q' `
  -WorkingDirectory $android -NoNewWindow -Wait -PassThru
if ($p.ExitCode -ne 0) { throw "Échec de la compilation Gradle ($($p.ExitCode))" }

New-Item -ItemType Directory -Force (Join-Path $root 'dist') | Out-Null
Copy-Item "$android\app\build\outputs\apk\debug\app-debug.apk" (Join-Path $root 'dist\Odysseum.apk') -Force
Write-Output "OK dist\Odysseum.apk"
