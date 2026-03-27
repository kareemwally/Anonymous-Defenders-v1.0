# Debug Deployment Issues
Write-Host "=== Debugging Deployment Issues ==="

# Check GitHub Actions workflow
Write-Host "1. Checking GitHub Actions workflow..."
Write-Host "Repository: kareemwally/Anonymous-Defenders-v1.0"
Write-Host "Branch: main"
Write-Host "Last commit: subscription feature"
Write-Host "GitHub Actions URL: https://github.com/kareemwally/Anonymous-Defenders-v1.0/actions"

# Check ECS Service
Write-Host "`n2. Checking ECS Service..."
try {
    $service = aws ecs describe-services --cluster anonymous-defenders --services anonymous-defenders-service | ConvertFrom-Json
    
    Write-Host "Service Name: $($service.Services[0].ServiceName)"
    Write-Host "Service Status: $($service.Services[0].Status)"
    Write-Host "Running Count: $($service.Services[0].RunningCount)"
    Write-Host "Desired Count: $($service.Services[0].DesiredCount)"
    Write-Host "Task Definition: $($service.Services[0].TaskDefinition)"
    
    # Check recent events
    Write-Host "`nRecent Events:"
    $service.Services[0].Events | Select-Object -Last 5 | ForEach-Object {
        Write-Host "  $($_.CreatedAt): $($_.Message)"
    }
    
} catch {
    Write-Host "❌ Failed to check ECS service: $_" -ForegroundColor Red
}

# Check ECR Repository
Write-Host "`n3. Checking ECR Repository..."
try {
    $ecr = aws ecr describe-repositories --repository-names anonymous_defenders | ConvertFrom-Json
    
    Write-Host "Repository Name: $($ecr.Repositories[0].RepositoryName)"
    Write-Host "Repository URI: $($ecr.Repositories[0].RepositoryUri)"
    
    # Check recent images
    $images = aws ecr list-images --repository-name anonymous_defenders | ConvertFrom-Json
    Write-Host "Recent Images: $($images.imageIds.Count) images"
    
    $images.imageIds | Select-Object -First 3 | ForEach-Object {
        Write-Host "  - $($_.imageTag)"
    }
    
} catch {
    Write-Host "❌ Failed to check ECR repository: $_" -ForegroundColor Red
}

# Check Task Definition
Write-Host "`n4. Checking Task Definition..."
try {
    if (Test-Path "ecs-task-definition-simple.json") {
        Write-Host "✅ ecs-task-definition-simple.json exists"
        
        $taskDef = Get-Content "ecs-task-definition-simple.json" | ConvertFrom-Json
        Write-Host "Task Family: $($taskDef.family)"
        Write-Host "CPU: $($taskDef.cpu)"
        Write-Host "Memory: $($taskDef.memory)"
        Write-Host "Container Name: $($taskDef.containerDefinitions[0].name)"
        Write-Host "Container Image: $($taskDef.containerDefinitions[0].image)"
        
    } else {
        Write-Host "❌ ecs-task-definition-simple.json not found" -ForegroundColor Red
    }
    
} catch {
    Write-Host "❌ Failed to check task definition: $_" -ForegroundColor Red
}

# Check Load Balancer
Write-Host "`n5. Checking Load Balancer..."
try {
    $alb = aws elbv2 describe-load-balancers --names anonymous-defenders-alb | ConvertFrom-Json
    
    Write-Host "Load Balancer State: $($alb.LoadBalancers[0].State)"
    Write-Host "Load Balancer DNS: $($alb.LoadBalancers[0].DNSName)"
    
    # Check target groups
    $tg = aws elbv2 describe-target-groups --load-balancer-arn $alb.LoadBalancers[0].LoadBalancerArn | ConvertFrom-Json
    Write-Host "Target Groups: $($tg.TargetGroups.Count)"
    
    $tg.TargetGroups | ForEach-Object {
        Write-Host "  - $($_.TargetGroupName): $($_.HealthCheckPath)"
    }
    
} catch {
    Write-Host "❌ Failed to check Load Balancer: $_" -ForegroundColor Red
}

Write-Host "`n=== Next Steps ==="
Write-Host "1. Check GitHub Actions: https://github.com/kareemwally/Anonymous-Defenders-v1.0/actions"
Write-Host "2. Check ECS Service Events for errors"
Write-Host "3. Verify GitHub Secrets are configured"
Write-Host "4. Check IAM permissions for ECS and ECR"
Write-Host "5. Test local deployment first: npm run dev"
