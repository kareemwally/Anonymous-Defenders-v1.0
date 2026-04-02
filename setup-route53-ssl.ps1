# AWS Route 53 + SSL Certificate Setup
Write-Host "=== Setting up Custom Domain with SSL Certificate ==="

# Step 1: Request SSL Certificate
Write-Host "1. Requesting SSL Certificate for anonymous-defenders.com..."
try {
    $cert = aws acm request-certificate `
        --domain-name anonymous-defenders.com `
        --subject-alternative-names www.anonymous-defenders.com `
        --validation-method DNS `
        --output json | ConvertFrom-Json
    
    $certArn = $cert.CertificateArn
    Write-Host "✅ Certificate requested successfully!"
    Write-Host "Certificate ARN: $certArn"
    
} catch {
    Write-Host "❌ Failed to request certificate: $_"
    exit 1
}

# Step 2: Get DNS Validation Records
Write-Host "`n2. Getting DNS validation records..."
try {
    $validation = aws acm describe-certificate `
        --certificate-arn $certArn `
        --query 'Certificate.DomainValidationOptions[0]' `
        --output json | ConvertFrom-Json
    
    $cnameName = $validation.Name
    $cnameValue = $validation.Value
    Write-Host "✅ DNS validation records retrieved!"
    Write-Host "CNAME Name: $cnameName"
    Write-Host "CNAME Value: $cnameValue"
    
} catch {
    Write-Host "❌ Failed to get validation records: $_"
    exit 1
}

# Step 3: Create Route 53 Hosted Zone (if not exists)
Write-Host "`n3. Creating Route 53 Hosted Zone..."
try {
    $hostedZone = aws route53 create-hosted-zone `
        --name anonymous-defenders.com `
        --caller-reference "anonymous-defenders-$(Get-Date -Format 'yyyyMMdd-HHmmss')" `
        --output json | ConvertFrom-Json
    
    $zoneId = $hostedZone.HostedZone.Id
    Write-Host "✅ Hosted zone created successfully!"
    Write-Host "Zone ID: $zoneId"
    
} catch {
    Write-Host "⚠️ Hosted zone might already exist, checking..."
    try {
        $hostedZone = aws route53 list-hosted-zones `
            --query 'HostedZones[?Name==`anonymous-defenders.com.`]' `
            --output json | ConvertFrom-Json
        
        if ($hostedZone.Count -gt 0) {
            $zoneId = $hostedZone[0].Id
            Write-Host "✅ Using existing hosted zone: $zoneId"
        } else {
            Write-Host "❌ No hosted zone found"
            exit 1
        }
    } catch {
        Write-Host "❌ Failed to check hosted zones: $_"
        exit 1
    }
}

# Step 4: Create DNS Validation Records
Write-Host "`n4. Creating DNS validation records..."
try {
    $zoneId = $zoneId -replace '/hostedzone/', ''
    
    $changeBatch = @{
        Changes = @(
            @{
                Action = "CREATE"
                ResourceRecordSet = @{
                    Name = $cnameName
                    Type = "CNAME"
                    TTL = 300
                    ResourceRecords = @(
                        @{
                            Value = $cnameValue
                        }
                    )
                }
            }
        )
    }
    
    $change = aws route53 change-resource-record-sets `
        --hosted-zone-id $zoneId `
        --change-batch ($changeBatch | ConvertTo-Json -Depth 10) `
        --output json | ConvertFrom-Json
    
    Write-Host "✅ DNS validation records created!"
    Write-Host "Change ID: $($change.ChangeInfo.Id)"
    
} catch {
    Write-Host "❌ Failed to create DNS records: $_"
    exit 1
}

# Step 5: Wait for Certificate Validation
Write-Host "`n5. Waiting for certificate validation..."
Write-Host "This may take 5-10 minutes..."

$timeout = 600  # 10 minutes
$interval = 30   # 30 seconds
$elapsed = 0

while ($elapsed -lt $timeout) {
    try {
        $certStatus = aws acm describe-certificate `
            --certificate-arn $certArn `
            --query 'Certificate.Status' `
            --output text
        
        if ($certStatus -eq "ISSUED") {
            Write-Host "✅ Certificate validated successfully!"
            break
        } elseif ($certStatus -eq "FAILED") {
            Write-Host "❌ Certificate validation failed!"
            exit 1
        } else {
            Write-Host "⏳ Certificate status: $certStatus (waiting...)"
            Start-Sleep -Seconds $interval
            $elapsed += $interval
        }
    } catch {
        Write-Host "❌ Failed to check certificate status: $_"
        exit 1
    }
}

if ($elapsed -ge $timeout) {
    Write-Host "❌ Certificate validation timed out!"
    exit 1
}

# Step 6: Get Load Balancer ARN
Write-Host "`n6. Getting Load Balancer ARN..."
try {
    $alb = aws elbv2 describe-load-balancers `
        --names anonymous-defenders-alb `
        --query 'LoadBalancers[0].LoadBalancerArn' `
        --output text
    
    Write-Host "✅ Load Balancer ARN: $alb"
    
} catch {
    Write-Host "❌ Failed to get Load Balancer ARN: $_"
    exit 1
}

# Step 7: Get Target Group ARN
Write-Host "`n7. Getting Target Group ARN..."
try {
    $targetGroup = aws elbv2 describe-target-groups `
        --names anonymous-defenders-tg `
        --query 'TargetGroups[0].TargetGroupArn' `
        --output text
    
    Write-Host "✅ Target Group ARN: $targetGroup"
    
} catch {
    Write-Host "❌ Failed to get Target Group ARN: $_"
    exit 1
}

# Step 8: Create HTTPS Listener
Write-Host "`n8. Creating HTTPS Listener..."
try {
    $listener = aws elbv2 create-listener `
        --load-balancer-arn $alb `
        --protocol HTTPS `
        --port 443 `
        --certificates CertificateArn=$certArn `
        --default-actions Type=forward,TargetGroupArn=$targetGroup `
        --output json | ConvertFrom-Json
    
    Write-Host "✅ HTTPS listener created successfully!"
    Write-Host "Listener ARN: $($listener.Listeners[0].ListenerArn)"
    
} catch {
    Write-Host "❌ Failed to create HTTPS listener: $_"
    exit 1
}

# Step 9: Create HTTP to HTTPS Redirect
Write-Host "`n9. Creating HTTP to HTTPS redirect..."
try {
    $redirect = aws elbv2 create-listener `
        --load-balancer-arn $alb `
        --protocol HTTP `
        --port 80 `
        --default-actions Type=redirect,Config='{"Protocol":"HTTPS","Port":"443","StatusCode":"HTTP_301"}' `
        --output json | ConvertFrom-Json
    
    Write-Host "✅ HTTP to HTTPS redirect created!"
    Write-Host "Redirect Listener ARN: $($redirect.Listeners[0].ListenerArn)"
    
} catch {
    Write-Host "❌ Failed to create HTTP redirect: $_"
    exit 1
}

# Step 10: Create A Record for Load Balancer
Write-Host "`n10. Creating A record for Load Balancer..."
try {
    $aliasRecord = @{
        Changes = @(
            @{
                Action = "CREATE"
                ResourceRecordSet = @{
                    Name = "anonymous-defenders.com"
                    Type = "A"
                    AliasTarget = @{
                        DNSName = "anonymous-defenders-alb-593198813.us-east-1.elb.amazonaws.com"
                        EvaluateTargetHealth = $false
                        HostedZoneId = "Z35SXDOTRQ7X7K"
                    }
                }
            }
        )
    }
    
    $aRecord = aws route53 change-resource-record-sets `
        --hosted-zone-id $zoneId `
        --change-batch ($aliasRecord | ConvertTo-Json -Depth 10) `
        --output json | ConvertFrom-Json
    
    Write-Host "✅ A record created successfully!"
    Write-Host "Change ID: $($aRecord.ChangeInfo.Id)"
    
} catch {
    Write-Host "❌ Failed to create A record: $_"
    exit 1
}

Write-Host "`n🎉 SSL Certificate and Custom Domain setup completed!"
Write-Host "`n=== Summary ==="
Write-Host "✅ Certificate ARN: $certArn"
Write-Host "✅ Domain: https://anonymous-defenders.com"
Write-Host "✅ HTTPS Listener: Created"
Write-Host "✅ HTTP Redirect: Created"
Write-Host "✅ A Record: Created"
Write-Host "`n🌐 Your secure API is now available at:"
Write-Host "https://anonymous-defenders.com"
Write-Host "`n⏰ DNS propagation may take 5-10 minutes"
