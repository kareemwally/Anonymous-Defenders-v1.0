# Check Server Status
Write-Host "=== Server Status Check ==="

# Check GitHub Actions
Write-Host "1. Checking GitHub Actions workflow..."
Write-Host "URL: https://github.com/kareemwally/Anonymous-Defenders-v1.0/actions"
Write-Host "Look for the latest workflow run"

# Check ECS Service
Write-Host "`n2. Checking ECS Service..."
try {
    $service = aws ecs describe-services --cluster anonymous-defenders --services anonymous-defenders-service | ConvertFrom-Json
    
    Write-Host "Service Status: $($service.Services[0].Status)"
    Write-Host "Running Count: $($service.Services[0].RunningCount)"
    Write-Host "Desired Count: $($service.Services[0].DesiredCount)"
    Write-Host "Task Definition: $($service.Services[0].TaskDefinition)"
    
    if ($service.Services[0].RunningCount -gt 0) {
        Write-Host "✅ Tasks are running!" -ForegroundColor Green
    } else {
        Write-Host "❌ No tasks running" -ForegroundColor Red
    }
    
} catch {
    Write-Host "❌ Failed to check ECS service: $_" -ForegroundColor Red
}

# Check Load Balancer
Write-Host "`n3. Checking Load Balancer..."
try {
    $alb = aws elbv2 describe-load-balancers --names anonymous-defenders-alb | ConvertFrom-Json
    
    Write-Host "Load Balancer State: $($alb.LoadBalancers[0].State)"
    Write-Host "Load Balancer DNS: $($alb.LoadBalancers[0].DNSName)"
    
    if ($alb.LoadBalancers[0].State -eq "active") {
        Write-Host "✅ Load Balancer is active!" -ForegroundColor Green
    } else {
        Write-Host "❌ Load Balancer is not active" -ForegroundColor Red
    }
    
} catch {
    Write-Host "❌ Failed to check Load Balancer: $_" -ForegroundColor Red
}

# Check CloudWatch Logs
Write-Host "`n4. Checking CloudWatch Logs..."
try {
    $logs = aws logs describe-log-groups --log-group-name-prefix /ecs/anonymous-defenders | ConvertFrom-Json
    
    Write-Host "Log Groups: $($logs.logGroups.Count)"
    
    $logs.logGroups | ForEach-Object {
        Write-Host "  - $($_.logGroupName)"
    }
    
} catch {
    Write-Host "❌ Failed to check CloudWatch logs: $_" -ForegroundColor Red
}

# Test API Endpoints
Write-Host "`n5. Testing API Endpoints..."
$baseUrl = "http://anonymous-defenders-alb-593198813.us-east-1.elb.amazonaws.com"

Write-Host "Testing: $baseUrl/api/v1/status"

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/v1/status" -Method GET -TimeoutSec 10
    Write-Host "Status Code: $($response.StatusCode)"
    Write-Host "Response: $($response.Content | ConvertFrom-Json)"
    
    if ($response.StatusCode -eq 200) {
        Write-Host "✅ API is responding!" -ForegroundColor Green
    } else {
        Write-Host "❌ API is not responding" -ForegroundColor Red
    }
    
} catch {
    Write-Host "❌ Failed to test API: $_" -ForegroundColor Red
}

Write-Host "`n=== Manual Test URLs ==="
Write-Host "1. Health Check: $baseUrl/health"
Write-Host "2. API Status: $baseUrl/api/v1/status"
Write-Host "3. Guest Status: $baseUrl/api/guest/status"
Write-Host "4. Subscription Info: $baseUrl/api/subscription/tiers"

Write-Host "`n=== Next Steps ==="
Write-Host "1. Check GitHub Actions for any errors"
Write-Host "2. Review CloudWatch logs for issues"
Write-Host "3. Test API endpoints manually"
Write-Host "4. Check ECS task health"
Write-Host "5. Verify environment variables"
