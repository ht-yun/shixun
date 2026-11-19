$ErrorActionPreference = 'Stop'

$adminSecurePassword = Read-Host 'CloudLab admin password' -AsSecureString
$accountSecurePassword = Read-Host 'Teacher and student password' -AsSecureString
$adminPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($adminSecurePassword)
$accountPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($accountSecurePassword)
$adminPassword = $null
$accountPassword = $null

try {
    $adminPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($adminPointer)
    $accountPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($accountPointer)
    $webSession = New-Object Microsoft.PowerShell.Commands.WebRequestSession
    $loginBody = @{ username = 'cloudlab-admin'; password = $adminPassword } | ConvertTo-Json
    Invoke-RestMethod `
        -Method Post `
        -Uri 'http://127.0.0.1:8080/api/auth/login' `
        -Body $loginBody `
        -ContentType 'application/json' `
        -WebSession $webSession `
        -TimeoutSec 30 | Out-Null

    $accounts = @(
        @{ username = 'teacher'; name = 'teacher'; role = 'teacher' },
        @{ username = 'student'; name = 'student'; role = 'student' }
    )
    foreach ($account in $accounts) {
        $body = @{
            username = $account.username
            name = $account.name
            password = $accountPassword
            role = $account.role
        } | ConvertTo-Json
        $created = Invoke-RestMethod `
            -Method Post `
            -Uri 'http://127.0.0.1:8080/api/auth/accounts' `
            -Body $body `
            -ContentType 'application/json' `
            -WebSession $webSession `
            -TimeoutSec 30
        Write-Output ("ACCOUNT_CREATED=" + $created.user.username + ":" + $created.user.role)
    }
}
finally {
    if ($adminPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($adminPointer) }
    if ($accountPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($accountPointer) }
    $adminPassword = $null
    $accountPassword = $null
    $adminSecurePassword = $null
    $accountSecurePassword = $null
}
