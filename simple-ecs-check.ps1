# Simple ECS Check
Write-Host "=== Simple ECS Check ==="

Write-Host "1. Checking ECS Service..."
try {
    $service = aws ecs describe-services --cluster anonymous-defenders --services anonymous-defenders-service
    Write-Host "Service Status: $($service.Services[0].Status)"
    Write-Host "Running Count: $($service.Services[0].RunningCount)"
    Write-Host "Desired Count: $($service.Services[0].DesiredCount)"
    
    if ($service.Services[0].RunningCount -eq 0) {
        Write-Host "❌ NO TASKS RUNNING - THIS IS THE PROBLEM!" -ForegroundColor Red
    } else {
        Write-Host "✅ Tasks are running" -ForegroundColor Green
    }
} catch {
    Write-Host "❌ Failed to check service: $_" -ForegroundColor Red
}

Write-Host "`n2. Checking Load Balancer..."
try {
    $alb = aws elbv2 describe-load-balancers --names anonymous-defenders-alb
    Write-Host "Load Balancer State: $($alb.LoadBalancers[0].State)"
    Write-Host "Load Balancer DNS: $($alb.LoadBalancers[0].DNSName)"
} catch {
    Write-Host "❌ Failed to check load balancer: $_" -ForegroundColor Red
}

Write-Host "`n=== Diagnosis ==="
if ($service.Services[0].RunningCount -eq 0) {
    Write-Host "🔍 MAIN ISSUE: ECS tasks are not running!" -ForegroundColor Red
    Write-Host "This means the deployment failed or tasks crashed." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "QUICK FIXES:" -ForegroundColor Green
    Write-Host "1. Force new deployment:" -ForegroundColor Green
    Write-Host "   aws ecs update-service --cluster anonymous-defenders --service anonymous-defenders-service --force-new-deployment" -ForegroundColor Green
    Write-Host ""
    Write-Host "2. Check GitHub Actions for errors:" -ForegroundColor Green
    Write-Host "   https://github.com/kareemwally/Anonymous-Defenders-v1.0/actions" -ForegroundColor Green
    Write-Host ""
    Write-Host "3. Check CloudWatch logs:" -ForegroundColor Green
    Write-Host "   aws logs get-log-events --log-group-name '/ecs/anonymous-defenders' --start-time (Get-Date).AddHours(-1).ToString('yyyy-MM-ddTHH:mm:ssZ')" -ForegroundColor Green
} else {
    Write-Host "✅ Tasks are running, checking other issues..." -ForegroundColor Green
}

Write-Host "`n=== Manual Test ==="
Write-Host "Test URL: http://anonymous-defenders-alb-593198813.us-east-1.elb.amazonaws.com"
Write-Host "Open in browser to check if server responds"
