# Check GitHub Actions Deployment Status
Write-Host "=== Deployment Status Check ==="

# Check GitHub Actions
Write-Host "Checking GitHub Actions workflow status..."
Write-Host "Repository: kareemwally/Anonymous-Defenders-v1.0"
Write-Host "Branch: main"
Write-Host "Last commit: subscription feature"

# Check ECS Service
Write-Host "`nChecking ECS Service..."
try {
    $service = aws ecs describe-services --cluster anonymous-defenders --services anonymous-defenders-service | ConvertFrom-Json
    
    Write-Host "Service Name: $($service.Services[0].ServiceName)"
    Write-Host "Service Status: $($service.Services[0].Status)"
    Write-Host "Running Count: $($service.Services[0].RunningCount)"
    Write-Host "Desired Count: $($service.Services[0].DesiredCount)"
    
    if ($service.Services[0].RunningCount -gt 0) {
        Write-Host "✅ Tasks are running!" -ForegroundColor Green
    } else {
        Write-Host "❌ No tasks running" -ForegroundColor Red
    }
    
} catch {
    Write-Host "❌ Failed to check ECS service: $_" -ForegroundColor Red
}

# Check Load Balancer
Write-Host "`nChecking Load Balancer..."
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

Write-Host "`n=== Deployment URLs ==="
Write-Host "Local Development: http://localhost:3000"
Write-Host "Production: http://anonymous-defenders-alb-593198813.us-east-1.elb.amazonaws.com"
Write-Host "GitHub Actions: https://github.com/kareemwally/Anonymous-Defenders-v1.0/actions"
