# Simple Server Test
Write-Host "=== Testing Server Connection ==="

$serverUrl = "http://anonymous-defenders-alb-593198813.us-east-1.elb.amazonaws.com"

Write-Host "Testing: $serverUrl"

try {
    # Test basic connection
    $response = Invoke-WebRequest -Uri $serverUrl -Method GET -TimeoutSec 15 -UseBasicParsing $false
    Write-Host "Status Code: $($response.StatusCode)"
    Write-Host "Server: $($response.Headers.Server)"
    Write-Host "Content Type: $($response.Headers['Content-Type'])"
    
    if ($response.StatusCode -eq 200) {
        Write-Host "✅ Server is responding!" -ForegroundColor Green
    } else {
        Write-Host "❌ Server returned status $($response.StatusCode)" -ForegroundColor Red
    }
    
} catch {
    Write-Host "❌ Failed to connect to server: $_" -ForegroundColor Red
    Write-Host "Possible causes:" -ForegroundColor Yellow
    Write-Host "1. Server is not running" -ForegroundColor Yellow
    Write-Host "2. Load Balancer is not configured correctly" -ForegroundColor Yellow
    Write-Host "3. Security Group is blocking traffic" -ForegroundColor Yellow
    Write-Host "4. Network connectivity issues" -ForegroundColor Yellow
}

Write-Host "`n=== Manual Test URLs ==="
Write-Host "1. Open in browser: $serverUrl"
Write-Host "2. Test API: $serverUrl/api/v1/status"
Write-Host "3. Check GitHub Actions: https://github.com/kareemwally/Anonymous-Defenders-v1.0/actions"

Write-Host "`n=== Quick Fixes ==="
Write-Host "1. Check GitHub Actions for deployment errors"
Write-Host "2. Verify ECS service is running"
Write-Host "3. Check Load Balancer health"
Write-Host "4. Review CloudWatch logs"
Write-Host "5. Test with curl from different network"
