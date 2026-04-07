# Check Load Balancer Health
Write-Host "=== Checking Load Balancer Health ==="

Write-Host "1. Checking Load Balancer Status..."
try {
    $alb = aws elbv2 describe-load-balancers --names anonymous-defenders-alb | ConvertFrom-Json
    
    Write-Host "Load Balancer Name: $($alb.LoadBalancers[0].LoadBalancerName)"
    Write-Host "State: $($alb.LoadBalancers[0].State)"
    Write-Host "DNS Name: $($alb.LoadBalancers[0].DNSName)"
    Write-Host "Created Time: $($alb.LoadBalancers[0].CreatedTime)"
    
    if ($alb.LoadBalancers[0].State -eq "active") {
        Write-Host "✅ Load Balancer is active" -ForegroundColor Green
    } else {
        Write-Host "❌ Load Balancer is not active: $($alb.LoadBalancers[0].State)" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Failed to check Load Balancer: $_" -ForegroundColor Red
}

Write-Host "`n2. Checking Target Groups..."
try {
    $targetGroups = aws elbv2 describe-target-groups --load-balancer-arn $alb.LoadBalancers[0].LoadBalancerArn | ConvertFrom-Json
    
    Write-Host "Target Groups Count: $($targetGroups.TargetGroups.Count)"
    
    $targetGroups.TargetGroups | ForEach-Object {
        Write-Host "Target Group: $($_.TargetGroupName)"
        Write-Host "  Protocol: $($_.Protocol)"
        Write-Host "  Port: $($_.Port)"
        Write-Host "  Health Check Path: $($_.HealthCheckPath)"
        Write-Host "  Health Check Protocol: $($_.HealthCheckProtocol)"
        Write-Host "  Health Check Port: $($_.HealthCheckPort)"
        Write-Host "  Health Check Interval: $($_.HealthCheckIntervalSeconds)s"
        Write-Host "  Health Check Timeout: $($_.HealthCheckTimeoutSeconds)s"
        Write-Host "  Healthy Threshold: $($_.HealthyThresholdCount)"
        Write-Host "  Unhealthy Threshold: $($_.UnhealthyThresholdCount)"
        
        Write-Host "`n  Checking Target Health..."
        $targetHealth = aws elbv2 describe-target-health --target-group-arn $_.TargetGroupArn | ConvertFrom-Json
        
        $targetHealth.TargetHealthDescriptions | ForEach-Object {
            Write-Host "    Target: $($_.Target.Id)"
            Write-Host "    Health: $($_.TargetHealth.State)"
            Write-Host "    Reason: $($_.TargetHealth.Reason)"
            
            if ($_.TargetHealth.State -eq "healthy") {
                Write-Host "    ✅ Target is healthy" -ForegroundColor Green
            } else {
                Write-Host "    ❌ Target is unhealthy: $($_.TargetHealth.State)" -ForegroundColor Red
            }
        }
    }
} catch {
    Write-Host "❌ Failed to check Target Groups: $_" -ForegroundColor Red
}

Write-Host "`n3. Checking Listeners..."
try {
    $listeners = aws elbv2 describe-listeners --load-balancer-arn $alb.LoadBalancers[0].LoadBalancerArn | ConvertFrom-Json
    
    Write-Host "Listeners Count: $($listeners.Listeners.Count)"
    
    $listeners.Listeners | ForEach-Object {
        Write-Host "Listener Port: $($_.Port)"
        Write-Host "  Protocol: $($_.Protocol)"
        Write-Host "  Default Actions:"
        $_.DefaultActions | ForEach-Object {
            Write-Host "    Type: $($_.Type)"
            if ($_.TargetGroupArn) {
                Write-Host "    Target Group: $($_.TargetGroupArn)"
            }
        }
    }
} catch {
    Write-Host "❌ Failed to check Listeners: $_" -ForegroundColor Red
}

Write-Host "`n4. Checking Security Groups..."
try {
    $sgs = aws ec2 describe-security-groups --group-ids $alb.LoadBalancers[0].SecurityGroups | ConvertFrom-Json
    
    Write-Host "Security Groups:"
    $sgs.SecurityGroups | ForEach-Object {
        Write-Host "  Group ID: $($_.GroupId)"
        Write-Host "  Group Name: $($_.GroupName)"
        Write-Host "  Description: $($_.Description)"
        Write-Host "  Inbound Rules:"
        $_.IpPermissions | ForEach-Object {
            Write-Host "    Protocol: $($_.IpProtocol)"
            Write-Host "    From Port: $($_.FromPort)"
            Write-Host "    To Port: $($_.ToPort)"
            Write-Host "    Source Ranges: $($_.IpRanges -join ', ')"
        }
    }
} catch {
    Write-Host "❌ Failed to check Security Groups: $_" -ForegroundColor Red
}

Write-Host "`n=== Diagnosis ==="
Write-Host "If Target Health is 'unhealthy' or 'unused':"
Write-Host "1. Check if container is running on port 3000"
Write-Host "2. Check if health check path is correct"
Write-Host "3. Check if security groups allow traffic"
Write-Host "4. Check if container is responding to health checks"

Write-Host "`n=== Common Fixes ==="
Write-Host "1. Update health check path to '/' or '/health'"
Write-Host "2. Ensure container responds on port 3000"
Write-Host "3. Check security group allows HTTP (port 80)"
Write-Host "4. Verify target group configuration"
