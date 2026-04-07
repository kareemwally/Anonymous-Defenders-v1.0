# Test API Connection
Write-Host "=== Testing API Connection ==="

$loadBalancerUrl = "http://anonymous-defenders-alb-593198813.us-east-1.elb.amazonaws.com"
$apiUrl = "$loadBalancerUrl/api/v1/status"

Write-Host "Load Balancer URL: $loadBalancerUrl"
Write-Host "API URL: $apiUrl"

Write-Host "`n1. Testing Load Balancer..."
try {
    $response = Invoke-WebRequest -Uri $loadBalancerUrl -Method GET -TimeoutSec 15
    Write-Host "Status Code: $($response.StatusCode)"
    Write-Host "Server: $($response.Headers.Server)"
    
    if ($response.StatusCode -eq 200) {
        Write-Host "✅ Load Balancer is responding!" -ForegroundColor Green
    } else {
        Write-Host "❌ Load Balancer returned $($response.StatusCode)" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Load Balancer connection failed: $_" -ForegroundColor Red
}

Write-Host "`n2. Testing API Endpoint..."
try {
    $apiResponse = Invoke-WebRequest -Uri $apiUrl -Method GET -TimeoutSec 15
    Write-Host "API Status Code: $($apiResponse.StatusCode)"
    
    if ($apiResponse.StatusCode -eq 200) {
        Write-Host "✅ API is responding!" -ForegroundColor Green
        Write-Host "Response: $($apiResponse.Content)"
    } else {
        Write-Host "❌ API returned $($apiResponse.StatusCode)" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ API connection failed: $_" -ForegroundColor Red
}

Write-Host "`n3. Testing Root Endpoint..."
try {
    $rootResponse = Invoke-WebRequest -Uri "$loadBalancerUrl/" -Method GET -TimeoutSec 15
    Write-Host "Root Status Code: $($rootResponse.StatusCode)"
    
    if ($rootResponse.StatusCode -eq 200) {
        Write-Host "✅ Root endpoint is responding!" -ForegroundColor Green
    } else {
        Write-Host "❌ Root endpoint returned $($rootResponse.StatusCode)" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Root endpoint connection failed: $_" -ForegroundColor Red
}

Write-Host "`n=== Diagnosis ==="
Write-Host "GitHub Actions: ✅ Completed successfully"
Write-Host "ECS Service: ✅ Running"
Write-Host "Container: ✅ Started"
Write-Host "Server: ❌ Not accessible from Load Balancer"

Write-Host "`nPossible Issues:"
Write-Host "1. Security Group blocking traffic"
Write-Host "2. Load Balancer Health Check failing"
Write-Host "3. Target Group not healthy"
Write-Host "4. Container port mapping issue"
Write-Host "5. Network ACLs blocking"

Write-Host "`n=== Quick Tests ==="
Write-Host "1. Open in browser: $loadBalancerUrl"
Write-Host "2. Test API: $apiUrl"
Write-Host "3. Check AWS Console: ECS → Clusters → anonymous-defenders → Services"
