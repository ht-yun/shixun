$ErrorActionPreference = 'Stop'

$securePassword = Read-Host 'Teacher and student password' -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
$plainPassword = $null
try {
    $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    foreach ($username in @('admin', 'teacher', 'student')) {
        $webSession = New-Object Microsoft.PowerShell.Commands.WebRequestSession
        $loginBody = @{ username = $username; password = $plainPassword } | ConvertTo-Json
        $login = Invoke-RestMethod `
            -Method Post `
            -Uri 'http://127.0.0.1:8080/api/auth/login' `
            -Body $loginBody `
            -ContentType 'application/json' `
            -WebSession $webSession `
            -TimeoutSec 30
        $data = Invoke-RestMethod `
            -Method Get `
            -Uri 'http://127.0.0.1:8080/api/bootstrap?runtime=1' `
            -WebSession $webSession `
            -TimeoutSec 60
        $course = @($data.courses | Where-Object { $_.id -eq 'bigdata-import-course' })
        Write-Output ("LOGIN_OK=" + $login.user.username + ":" + $login.user.role + ";COURSE_VISIBLE=" + ($course.Count -eq 1) + ";COURSE_COUNT=" + @($data.courses).Count + ";LAB_COUNT=" + @($data.labs).Count)
    }
}
finally {
    if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
    $plainPassword = $null
    $securePassword = $null
}
