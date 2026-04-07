# Debug ECS Tasks
Write-Host "=== Debugging ECS Tasks ==="

# Get ECS Service Status
Write-Host "1. Getting ECS Service Status..."
try {
    $service = aws ecs describe-services --cluster anonymous-defenders --services anonymous-defenders-service | ConvertFrom-Json
    
    Write-Host "Service Name: $($service.Services[0].ServiceName)"
    Write-Host "Service Status: $($service.Services[0].Status)"
    Write-Host "Running Count: $($service.Services[0].RunningCount)"
    Write-Host "Desired Count: $($service.Services[0].DesiredCount)"
    Write-Host "Task Definition: $($service.Services[0].TaskDefinition)"
    
    if ($service.Services[0].RunningCount -eq 0) {
        Write-Host "❌ NO TASKS ARE RUNNING!" -ForegroundColor Red
        Write-Host "This is likely the main issue!" -ForegroundColor Yellow
    } else {
        Write-Host "✅ Tasks are running: $($service.Services[0].RunningCount)" -ForegroundColor Green
    }
    
} catch {
    Write-Host "❌ Failed to get service status: $_" -ForegroundColor Red
}

# Get Running Tasks
Write-Host "`n2. Getting Running Tasks..."
try {
    $tasks = aws ecs list-tasks --cluster anonymous-defenders | ConvertFrom-Json
    
    Write-Host "Total Tasks: $($tasks.taskArns.Count)"
    
    if ($tasks.taskArns.Count -gt 0) {
        $tasks.taskArns | ForEach-Object {
            Write-Host "  - $_" -ForegroundColor Green
        }
    } else {
        Write-Host "❌ No running tasks found!" -ForegroundColor Red
    }
    
} catch {
    Write-Host "❌ Failed to list tasks: $_" -ForegroundColor Red
}

# Get Task Details
Write-Host "`n3. Getting Task Details..."
try {
    if ($tasks.taskArns.Count -gt 0) {
        $taskArn = $tasks.taskArns[0]
        $taskDetails = aws ecs describe-tasks --cluster anonymous-defenders --tasks $taskArn | ConvertFrom-Json
        
        Write-Host "Task ARN: $taskArn"
        Write-Host "Task Status: $($taskDetails.tasks[0].LastStatus)"
        Write-Host "Task Health: $($taskDetails.tasks[0].HealthStatus)"
        Write-Host "Started At: $($taskDetails.tasks[0].StartedAt)"
        Write-Host "Stop Code: $($taskDetails.tasks[0].StopCode)"
        
        if ($taskDetails.tasks[0].LastStatus -eq "RUNNING") {
            Write-Host "✅ Task is running!" -ForegroundColor Green
        } else {
            Write-Host "❌ Task is not running: $($taskDetails.tasks[0].LastStatus)" -ForegroundColor Red
        }
    }
} catch {
    Write-Host "❌ Failed to get task details: $_" -ForegroundColor Red
}

# Check Container Logs
Write-Host "`n4. Getting Container Logs..."
try {
    if ($tasks.taskArns.Count -gt 0) {
        $taskArn = $tasks.taskArns[0]
        $taskId = $taskArn.Split('/')[-1]
        
        Write-Host "Getting logs for task: $taskId"
        
        $logs = aws logs get-log-events `
            --log-group-name "/ecs/anonymous-defenders" `
            --log-stream-prefix "ecs/anonymous-defenders" `
            --filter-patterns "taskId=$taskId" `
            --start-time (Get-Date).AddHours(-1).ToString("yyyy-MM-ddTHH:mm:ssZ") `
            --query 'events[*].[timestamp,message]' `
            --output json | ConvertFrom-Json
        
        Write-Host "Recent Log Events:"
        $logs | Select-Object -Last 10 | ForEach-Object {
            Write-Host "  $($_.timestamp): $($_.message)"
        }
    }
} catch {
    Write-Host "❌ Failed to get logs: $_" -ForegroundColor Red
}

Write-Host "`n=== Diagnosis ==="
if ($service.Services[0].RunningCount -eq 0) {
    Write-Host "🔍 MAIN ISSUE: No ECS tasks are running!" -ForegroundColor Red
    Write-Host "This means the deployment failed or tasks crashed." -ForegroundColor Yellow
    Write-Host "" -ForegroundColor Yellow
    Write-Host "Possible causes:" -ForegroundColor Yellow
    Write-Host "1. Task definition is invalid" -ForegroundColor Yellow
    Write-Host "2. Container failed to start" -ForegroundColor Yellow
    Write-Host "3. Resource limits exceeded" -ForegroundColor Yellow
    Write-Host "4. Environment variables missing" -ForegroundColor Yellow
    Write-Host "5. Application startup error" -ForegroundColor Yellow
    Write-Host "" -ForegroundColor Yellow
    Write-Host "Next steps:" -ForegroundColor Green
    Write-Host "1. Check CloudWatch logs for errors" -ForegroundColor Green
    Write-Host "2. Review task definition" -ForegroundColor Green
    Write-Host "3. Check resource limits" -ForegroundColor Green
    Write-Host "4. Force new deployment" -ForegroundColor Green
} else {
    Write-Host "✅ Tasks are running, but may have other issues" -ForegroundColor Green
    Write-Host "Check container logs for application errors" -ForegroundColor Green
}

Write-Host "`n=== Quick Fixes ==="
Write-Host "1. Force new deployment:"
Write-Host "   aws ecs update-service --cluster anonymous-defenders --service anonymous-defenders-service --force-new-deployment"
Write-Host ""
Write-Host "2. Check task definition:"
Write-Host "   aws ecs describe-task-definition --task-definition anonymous-defenders"
Write-Host ""
Write-Host "3. Check CloudWatch logs:"
Write-Host "   aws logs get-log-events --log-group-name '/ecs/anonymous-defenders' --start-time (Get-Date).AddHours(-1).ToString('yyyy-MM-ddTHH:mm:ssZ')"
