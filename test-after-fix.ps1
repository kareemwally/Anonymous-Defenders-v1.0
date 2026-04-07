# Test After Fix
Write-Host "=== Testing After Fix ==="

Write-Host "Waiting 5 minutes for deployment..."
Start-Sleep -Seconds 300

$serverUrl = "http://anonymous-defenders-alb-593198813.us-east-1.elb.amazonaws.com"

Write-Host "Testing: $serverUrl"

try {
    $response = Invoke-WebRequest -Uri $serverUrl -Method GET -TimeoutSec 15
    Write-Host "Status Code: $($response.StatusCode)"
    Write-Host "Server: $($response.Headers.Server)"
    
    if ($response.StatusCode -eq 200) {
        Write-Host "✅ SERVER IS WORKING!" -ForegroundColor Green
        Write-Host "🎉 The fix worked!" -ForegroundColor Green
    } else {
        Write-Host "❌ Server returned $($response.StatusCode)" -ForegroundColor Red
    }
    
} catch {
    Write-Host "❌ Still failing: $_" -ForegroundColor Red
}

Write-Host "`n=== Test API Endpoints ==="
try {
    $apiResponse = Invoke-WebRequest -Uri "$serverUrl/api/v1/status" -Method GET -TimeoutSec 15
    Write-Host "API Status: $($apiResponse.StatusCode)"
    
    if ($apiResponse.StatusCode -eq 200) {
        Write-Host "✅ API IS WORKING!" -ForegroundColor Green
    } else {
        Write-Host "❌ API returned $($apiResponse.StatusCode)" -ForegroundColor Red
    }
    
} catch {
    Write-Host "❌ API still failing: $_" -ForegroundColor Red
}

Write-Host "`n=== Summary ==="
Write-Host "Fix Applied: Bind server to 0.0.0.0:3000"
Write-Host "Expected Result: Server responds on Load Balancer URL"
Write-Host "Test URL: $serverUrl"
Write-Host "API URL: $serverUrl/api/v1/status"
