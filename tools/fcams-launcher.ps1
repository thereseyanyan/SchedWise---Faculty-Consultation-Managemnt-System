[CmdletBinding()]
param(
    [ValidateSet('start', 'stop')]
    [string]$Action = 'start',
    [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$RuntimeDir = Join-Path $ProjectRoot '.runtime'
$LogDir = Join-Path $RuntimeDir 'logs'
$PidFile = Join-Path $RuntimeDir 'processes.json'
$FrontendDir = Join-Path $ProjectRoot 'frontend'
$BackendDir = Join-Path $ProjectRoot 'backend'
$MailpitDir = Join-Path $RuntimeDir 'mailpit'
$MailpitExe = Join-Path $MailpitDir 'mailpit.exe'

New-Item -ItemType Directory -Force -Path $RuntimeDir, $LogDir | Out-Null
$LauncherLog = Join-Path $LogDir 'launcher.log'

function Write-Log {
    param([string]$Message)
    $line = '[{0}] {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
    Add-Content -LiteralPath $LauncherLog -Value $line -Encoding UTF8
}

function Show-Failure {
    param([string]$Message)
    Write-Log "FAILED: $Message"
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show(
        "$Message`n`nLogs: $LogDir",
        'FCAMS',
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Error
    ) | Out-Null
}

function Show-Warning {
    param([string]$Message)
    Write-Log "WARNING: $Message"
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show(
        "$Message`n`nLogs: $LogDir",
        'FCAMS',
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Warning
    ) | Out-Null
}

function New-DependencyException {
    param(
        [string]$Kind,
        [string]$Message,
        [string]$HelpUrl
    )
    $exception = [System.Exception]::new($Message)
    $exception.Data['FCAMS_DEPENDENCY'] = $Kind
    $exception.Data['FCAMS_HELP_URL'] = $HelpUrl
    return $exception
}

function Show-DependencyHelp {
    param(
        [string]$Kind,
        [string]$Message,
        [string]$HelpUrl
    )
    Write-Log "PREREQUISITE: $Kind - $Message"
    Add-Type -AssemblyName System.Windows.Forms
    $prompt = "$Message`n`nAfter installing, double-click FCAMS again.`n`nLogs: $LogDir"
    $answer = [System.Windows.Forms.MessageBox]::Show(
        $prompt,
        "FCAMS - $Kind required",
        [System.Windows.Forms.MessageBoxButtons]::YesNo,
        [System.Windows.Forms.MessageBoxIcon]::Warning
    )
    if ($answer -eq [System.Windows.Forms.DialogResult]::Yes -and $HelpUrl) {
        try {
            Start-Process $HelpUrl | Out-Null
            Write-Log "Opened prerequisite help page: $HelpUrl"
        } catch {
            Write-Log "Could not open prerequisite help page: $($_.Exception.Message)"
        }
    }
}

function Test-Port {
    param([int]$Port, [int]$TimeoutMilliseconds = 400)
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $async = $client.BeginConnect('127.0.0.1', $Port, $null, $null)
        if (-not $async.AsyncWaitHandle.WaitOne($TimeoutMilliseconds)) {
            return $false
        }
        $client.EndConnect($async)
        return $true
    } catch {
        return $false
    } finally {
        $client.Close()
    }
}

function Wait-Port {
    param([int]$Port, [int]$TimeoutSeconds = 30)
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        if (Test-Port -Port $Port) {
            return $true
        }
        Start-Sleep -Milliseconds 500
    }
    return $false
}

function Test-Backend {
    try {
        $response = Invoke-RestMethod -Uri 'http://127.0.0.1:8000/health.php' -TimeoutSec 3
        return ($response.data.status -eq 'healthy')
    } catch {
        return $false
    }
}

function Test-Frontend {
    try {
        $response = Invoke-WebRequest -Uri 'http://localhost:5173' -UseBasicParsing -TimeoutSec 3
        return ($response.StatusCode -eq 200 -and $response.Content -match 'Faculty Consultation')
    } catch {
        return $false
    }
}

function Wait-Backend {
    param([int]$TimeoutSeconds = 30)
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        if (Test-Backend) {
            return $true
        }
        Start-Sleep -Milliseconds 500
    }
    return $false
}

function Wait-Frontend {
    param([int]$TimeoutSeconds = 60)
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        if (Test-Frontend) {
            return $true
        }
        Start-Sleep -Milliseconds 750
    }
    return $false
}

function Get-NodeVersion {
    param([string]$Node)
    try {
        $raw = (& $Node --version 2>$null | Out-String).Trim()
        if ($raw -match '^v(\d+)\.(\d+)\.(\d+)') {
            return [version]::new(
                [int]$Matches[1],
                [int]$Matches[2],
                [int]$Matches[3]
            )
        }
    } catch {
        Write-Log "Could not read the Node.js version: $($_.Exception.Message)"
    }
    return $null
}

function Test-NodeVersionSupported {
    param([version]$Version)
    if ($Version.Major -eq 20) {
        return $Version.Minor -ge 19
    }
    if ($Version.Major -eq 22) {
        return $Version.Minor -ge 12
    }
    return $Version.Major -gt 22
}

function Find-Php {
    $candidates = @(
        'C:\xampp\php\php.exe',
        (Get-Command php.exe -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -ErrorAction SilentlyContinue)
    )
    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path -LiteralPath $candidate)) {
            try {
                $version = (& $candidate -r 'echo PHP_VERSION;' 2>$null | Out-String).Trim()
                if ($version -match '^(\d+)\.' -and [int]$Matches[1] -lt 8) {
                    throw (New-DependencyException `
                        -Kind 'PHP 8+' `
                        -Message "PHP $version was found at $candidate, but FCAMS requires PHP 8.0 or newer." `
                        -HelpUrl 'https://www.apachefriends.org/download.html')
                }
            } catch {
                # If the version probe itself failed, continue and let PHP
                # report the real problem instead of blocking startup.
                if ($_.Exception.Data['FCAMS_DEPENDENCY']) {
                    throw
                }
            }
            return $candidate
        }
    }
    throw (New-DependencyException `
        -Kind 'PHP 8+' `
        -Message 'PHP was not found. Install XAMPP (includes PHP 8) or PHP, then make sure C:\xampp\php\php.exe exists or php.exe is on PATH.' `
        -HelpUrl 'https://www.apachefriends.org/download.html')
}

function Find-Node {
    $nodePath = $null
    $node = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($node) {
        $nodePath = $node.Source
    } else {
        foreach ($candidate in @('C:\Program Files\nodejs\node.exe', 'C:\node.exe')) {
            if (Test-Path -LiteralPath $candidate) {
                $nodePath = $candidate
                break
            }
        }
    }

    if (-not $nodePath) {
        throw (New-DependencyException `
            -Kind 'Node.js' `
            -Message 'Node.js was not found. Install Node.js 20.19+ or 22.12+ (LTS) from nodejs.org.' `
            -HelpUrl 'https://nodejs.org/en/download')
    }

    $version = Get-NodeVersion -Node $nodePath
    if ($version -and -not (Test-NodeVersionSupported -Version $version)) {
        throw (New-DependencyException `
            -Kind 'Node.js' `
            -Message "Node.js $version was found at $nodePath, but FCAMS requires Node.js 20.19+ or 22.12+. Install a current LTS release." `
            -HelpUrl 'https://nodejs.org/en/download')
    }

    return $nodePath
}

function Find-Npm {
    $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if ($npm) {
        return $npm.Source
    }
    throw (New-DependencyException `
        -Kind 'npm' `
        -Message 'npm was not found. Reinstall Node.js 20.19+ or 22.12+; npm is included with the Node.js installer.' `
        -HelpUrl 'https://nodejs.org/en/download')
}

function Ensure-LocalConfig {
    $config = Join-Path $BackendDir 'config.php'
    if (-not (Test-Path -LiteralPath $config)) {
        Copy-Item -LiteralPath (Join-Path $BackendDir 'config.example.php') -Destination $config
        $content = Get-Content -LiteralPath $config -Raw
        $content = $content -replace "'debug'\s*=>\s*false", "'debug' => true"
        [System.IO.File]::WriteAllText($config, $content, [System.Text.UTF8Encoding]::new($false))
        Write-Log 'Created local configuration with Mailpit testing defaults.'
    }

    $envFile = Join-Path $FrontendDir '.env'
    if (-not (Test-Path -LiteralPath $envFile)) {
        Copy-Item -LiteralPath (Join-Path $FrontendDir '.env.example') -Destination $envFile
        Write-Log 'Created frontend/.env from .env.example.'
    }
}

function Ensure-MySql {
    if (Test-Port -Port 3306) {
        return
    }

    Write-Log 'MySQL is not listening; attempting to start it.'

    $services = @(Get-Service | Where-Object {
        $_.Name -match 'mysql' -or $_.DisplayName -match 'mysql'
    })
    $service = $services | Select-Object -First 1

    if ($service) {
        try {
            Start-Service -Name $service.Name -ErrorAction Stop
            Write-Log "Started MySQL service: $($service.Name)"
        } catch {
            Write-Log "Could not start MySQL service ($($service.Name)): $($_.Exception.Message)"
        }
    }

    if (-not (Wait-Port -Port 3306 -TimeoutSeconds 12)) {
        $serviceInfo = $null
        if ($service) {
            $serviceInfo = Get-CimInstance Win32_Service -Filter "Name='$($service.Name)'" -ErrorAction SilentlyContinue
        }

        $mysqld = $null
        $defaultsFile = $null
        if ($serviceInfo -and $serviceInfo.PathName) {
            $pathMatch = [regex]::Match($serviceInfo.PathName, '^"([^"]+)"')
            if ($pathMatch.Success) {
                $mysqld = $pathMatch.Groups[1].Value
            }
            $defaultsMatch = [regex]::Match($serviceInfo.PathName, '--defaults-file="?([^"]+)"?')
            if ($defaultsMatch.Success) {
                $defaultsFile = $defaultsMatch.Groups[1].Value
            }
        }

        if (-not $mysqld -or -not (Test-Path -LiteralPath $mysqld)) {
            $found = Get-ChildItem 'C:\Program Files\MySQL', 'C:\xampp\mysql' -Recurse -Filter mysqld.exe -ErrorAction SilentlyContinue |
                Select-Object -First 1
            if ($found) {
                $mysqld = $found.FullName
            }
        }

        if ($mysqld -and (Test-Path -LiteralPath $mysqld)) {
            $arguments = @()
            if ($defaultsFile -and (Test-Path -LiteralPath $defaultsFile)) {
                $arguments += "--defaults-file=`"$defaultsFile`""
            }
            $arguments += '--console'
            $mysqlOut = Join-Path $LogDir 'mysql.out.log'
            $mysqlErr = Join-Path $LogDir 'mysql.err.log'
            Start-Process -FilePath $mysqld `
                -ArgumentList ($arguments -join ' ') `
                -WorkingDirectory (Split-Path -Parent $mysqld) `
                -WindowStyle Hidden `
                -RedirectStandardOutput $mysqlOut `
                -RedirectStandardError $mysqlErr | Out-Null
            Write-Log "Started MySQL directly: $mysqld"
        }
    }

    if (-not (Wait-Port -Port 3306 -TimeoutSeconds 30)) {
        throw (New-DependencyException `
            -Kind 'MySQL' `
            -Message 'MySQL is not listening on 127.0.0.1:3306. Start the MySQL95 service or MySQL from XAMPP, then try again. If MySQL is not installed, use the XAMPP installer.' `
            -HelpUrl 'https://www.apachefriends.org/download.html')
    }
}

function Ensure-Database {
    param([string]$Php)

    $setup = Join-Path $PSScriptRoot 'setup-database.php'
    $setupLog = Join-Path $LogDir 'database.log'
    $output = & $Php $setup 2>&1 | Out-String
    Add-Content -LiteralPath $setupLog -Value $output -Encoding UTF8
    if ($LASTEXITCODE -ne 0) {
        throw "Database setup failed. See $setupLog"
    }
    Write-Log 'Database schema is ready.'
}

function Ensure-FrontendDependencies {
    param([string]$Npm)

    $viteEntry = Join-Path $FrontendDir 'node_modules\vite\bin\vite.js'
    if (Test-Path -LiteralPath $viteEntry) {
        return
    }

    Write-Log 'Installing frontend dependencies (first run).'
    $installOut = Join-Path $LogDir 'npm-install.out.log'
    $installErr = Join-Path $LogDir 'npm-install.err.log'
    $process = Start-Process -FilePath $env:ComSpec `
        -ArgumentList '/d', '/c', "`"$Npm`" install" `
        -WorkingDirectory $FrontendDir `
        -WindowStyle Hidden `
        -RedirectStandardOutput $installOut `
        -RedirectStandardError $installErr `
        -PassThru `
        -Wait
    if ($process.ExitCode -ne 0) {
        throw "npm install failed. See $installErr"
    }
    Write-Log 'Frontend dependencies installed.'
}


function Start-Backend {
    param([string]$Php)

    $sessionDir = Join-Path $RuntimeDir 'sessions'
    New-Item -ItemType Directory -Force -Path $sessionDir | Out-Null

    $outLog = Join-Path $LogDir 'backend.out.log'
    $errLog = Join-Path $LogDir 'backend.err.log'
    $arguments = @(
        '-d', "`"session.save_path=$sessionDir`"",
        '-S', '127.0.0.1:8000',
        '-t', "`"$BackendDir`""
    )

    $process = Start-Process -FilePath $Php `
        -ArgumentList ($arguments -join ' ') `
        -WorkingDirectory $ProjectRoot `
        -WindowStyle Hidden `
        -RedirectStandardOutput $outLog `
        -RedirectStandardError $errLog `
        -PassThru
    Write-Log "Started PHP API (PID $($process.Id))."
    return $process
}

function Ensure-Mailpit {
    if (Test-Port -Port 1025) { Write-Log 'SMTP is already listening on port 1025.'; return $null }
    if (-not (Test-Path -LiteralPath $MailpitExe)) {
        New-Item -ItemType Directory -Force -Path $MailpitDir | Out-Null
        $zip = Join-Path $MailpitDir 'mailpit.zip'
        Write-Log 'Downloading Mailpit for local email testing.'
        Invoke-WebRequest -Uri 'https://github.com/axllent/mailpit/releases/download/v1.31.6/mailpit-windows-amd64.zip' -OutFile $zip -UseBasicParsing
        Expand-Archive -LiteralPath $zip -DestinationPath $MailpitDir -Force
    }
    $process = Start-Process -FilePath $MailpitExe -ArgumentList @('--listen', '127.0.0.1:8025', '--smtp', '127.0.0.1:1025', '--database', ('"' + (Join-Path $MailpitDir 'mailpit.db') + '"')) -WorkingDirectory $MailpitDir -WindowStyle Hidden -RedirectStandardOutput (Join-Path $LogDir 'mailpit.out.log') -RedirectStandardError (Join-Path $LogDir 'mailpit.err.log') -PassThru
    if (-not (Wait-Port -Port 1025 -TimeoutSeconds 10)) { throw 'Mailpit did not start on port 1025.' }
    Write-Log "Started local Mailpit (PID $($process.Id))."
    return $process
}

function Start-Frontend {
    param([string]$Node)

    $viteEntry = Join-Path $FrontendDir 'node_modules\vite\bin\vite.js'
    $outLog = Join-Path $LogDir 'vite.out.log'
    $errLog = Join-Path $LogDir 'vite.err.log'
    $arguments = @("`"$viteEntry`"", '--host', 'localhost', '--port', '5173', '--strictPort')

    $process = Start-Process -FilePath $Node `
        -ArgumentList ($arguments -join ' ') `
        -WorkingDirectory $FrontendDir `
        -WindowStyle Hidden `
        -RedirectStandardOutput $outLog `
        -RedirectStandardError $errLog `
        -PassThru
    Write-Log "Started Vite frontend (PID $($process.Id))."
    return $process
}

function Stop-TrackedProcesses {
    if (-not (Test-Path -LiteralPath $PidFile)) {
        Write-Log 'No tracked FCAMS processes to stop.'
        return
    }

    try {
        $tracked = Get-Content -LiteralPath $PidFile -Raw | ConvertFrom-Json
    } catch {
        Write-Log 'Could not read process file; removing it.'
        Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
        return
    }

    foreach ($id in @($tracked.backend, $tracked.frontend, $tracked.mailpit)) {
        if (-not $id) {
            continue
        }
        $process = Get-Process -Id ([int]$id) -ErrorAction SilentlyContinue
        if ($process) {
            & taskkill.exe /PID ([int]$id) /T /F 2>&1 | Out-Null
            Write-Log "Stopped tracked process PID $id."
        }
    }

    Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
}

function Save-TrackedProcesses {
    param($BackendProcess, $FrontendProcess, $MailpitProcess)

    $existing = $null
    if (Test-Path -LiteralPath $PidFile) {
        try {
            $existing = Get-Content -LiteralPath $PidFile -Raw | ConvertFrom-Json
        } catch {
            $existing = $null
        }
    }

    $backendId = if ($BackendProcess) { $BackendProcess.Id } elseif ($existing.backend) { [int]$existing.backend } else { $null }
    $frontendId = if ($FrontendProcess) { $FrontendProcess.Id } elseif ($existing.frontend) { [int]$existing.frontend } else { $null }
    $mailpitId = if ($MailpitProcess) { $MailpitProcess.Id } elseif ($existing.mailpit) { [int]$existing.mailpit } else { $null }

    $data = [ordered]@{
        backend = $backendId
        frontend = $frontendId
        mailpit = $mailpitId
        started_at = (Get-Date).ToString('o')
    }
    $data | ConvertTo-Json | Set-Content -LiteralPath $PidFile -Encoding UTF8
}

try {
    if ($Action -eq 'stop') {
        Stop-TrackedProcesses
        exit 0
    }

    Write-Log 'Starting FCAMS.'

    Ensure-LocalConfig
    $php = Find-Php
    $node = Find-Node
    $npm = Find-Npm

    Ensure-MySql
    Ensure-Database -Php $php
    Ensure-FrontendDependencies -Npm $npm

    $backendProcess = $null
    $frontendProcess = $null
    $mailpitProcess = $null

    if (Test-Backend) {
        Write-Log 'PHP API is already running.'
    } else {
        $backendProcess = Start-Backend -Php $php
    }

    if (Test-Frontend) {
        Write-Log 'Frontend is already running.'
    } else {
        $frontendProcess = Start-Frontend -Node $node
    }


    try { $mailpitProcess = Ensure-Mailpit }
    catch { Show-Warning "Local email testing is unavailable. $($_.Exception.Message)" }

    if ($backendProcess -or $frontendProcess -or $mailpitProcess) {
        Save-TrackedProcesses -BackendProcess $backendProcess -FrontendProcess $frontendProcess -MailpitProcess $mailpitProcess
    }

    if (-not (Wait-Backend -TimeoutSeconds 30)) {
        throw 'The PHP API did not become ready. See .runtime/logs/backend.err.log'
    }
    if (-not (Wait-Frontend -TimeoutSeconds 60)) {
        throw 'The frontend did not become ready. See .runtime/logs/vite.err.log'
    }

    Write-Log 'FCAMS is ready at http://localhost:5173'
    if (-not $NoBrowser -and $env:FCAMS_NO_BROWSER -ne '1') {
        Start-Process 'http://localhost:5173' | Out-Null
    }
    exit 0
} catch {
    if ($backendProcess -or $frontendProcess) {
        Stop-TrackedProcesses
    }

    $dependency = [string]$_.Exception.Data['FCAMS_DEPENDENCY']
    if ($dependency) {
        Show-DependencyHelp `
            -Kind $dependency `
            -Message $_.Exception.Message `
            -HelpUrl ([string]$_.Exception.Data['FCAMS_HELP_URL'])
    } else {
        Show-Failure $_.Exception.Message
    }
    exit 1
}
