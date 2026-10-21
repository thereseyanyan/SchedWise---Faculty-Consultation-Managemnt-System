[CmdletBinding()]
param(
    [switch]$SkipStart
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$TestFile = Join-Path $ProjectRoot 'tests\api.test.mjs'

function Find-Php {
    $candidates = @(
        'C:\xampp\php\php.exe',
        (Get-Command php.exe -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -ErrorAction SilentlyContinue)
    )
    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path -LiteralPath $candidate)) {
            return $candidate
        }
    }
    throw 'PHP was not found. Install XAMPP/PHP or add php.exe to PATH.'
}

function Find-Node {
    $node = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($node) {
        return $node.Source
    }
    foreach ($candidate in @('C:\Program Files\nodejs\node.exe', 'C:\node.exe')) {
        if (Test-Path -LiteralPath $candidate) {
            return $candidate
        }
    }
    throw 'Node.js was not found. Install Node.js 20 or newer.'
}

function Test-App {
    try {
        $response = Invoke-RestMethod -Uri 'http://127.0.0.1:8000/health.php' -TimeoutSec 3
        return ($response.data.status -eq 'healthy')
    } catch {
        return $false
    }
}

function Test-Mailpit {
    try {
        Invoke-RestMethod -Uri 'http://127.0.0.1:8025/api/v1/messages' -TimeoutSec 3 | Out-Null
        return $true
    } catch {
        return $false
    }
}

if (-not (Test-App) -or -not (Test-Mailpit)) {
    if ($SkipStart) {
        throw 'FCAMS and Mailpit must be running for the API tests. Start FCAMS or omit -SkipStart.'
    }
    Write-Host 'Starting FCAMS/Mailpit for the test run...'
    & (Join-Path $PSScriptRoot 'fcams-launcher.ps1') start -NoBrowser
    if ($LASTEXITCODE -ne 0 -or -not (Test-App) -or -not (Test-Mailpit)) {
        throw 'FCAMS or Mailpit did not start. Check .runtime/logs/launcher.log.'
    }
}

$php = Find-Php
$node = Find-Node
$env:FCAMS_PHP = $php

Write-Host 'Running FCAMS API tests...'
& $node --test $TestFile
exit $LASTEXITCODE
