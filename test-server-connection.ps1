# Test Server Connection
Write-Host "=== Testing Server Connection ==="

$serverUrl = "http://anonymous-defenders-alb-593198813.us-east-1.elb.amazonaws.com"

Write-Host "Testing: $serverUrl"

# Test with curl
try {
    $result = curl -s -w "HTTP Status: %{http_code}, Time: %{time_total}" -o /dev/null $serverUrl --connect-timeout 10
    Write-Host "Result: $result"
    
    if ($result -match "HTTP Status: 200") {
        Write-Host "✅ Server is responding!" -ForegroundColor Green
    } else {
        Write-Host "❌ Server is not responding" -ForegroundColor Red
        Write-Host "This confirms the server is down!" -ForegroundColor Yellow
    }
} catch {
    Write-Host "❌ Failed to test: $_" -ForegroundColor Red
}

Write-Host ""
Write-Host "=== Next Steps ==="
Write-Host "1. If server is down, check AWS Console"
Write-Host "2. Go to ECS → Clusters → anonymous-defenders → Services"
Write-Host "3. Check service status and running tasks"
Write-Host "4. Check CloudWatch logs for errors"
Write-Host "5. Force new deployment if needed"
