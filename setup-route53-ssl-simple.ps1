# Simple Route 53 + SSL Certificate Setup
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
    Write-Host "`n📋 Please add these DNS records to your domain provider:"
    Write-Host "Name: $cnameName"
    Write-Host "Type: CNAME"
    Write-Host "Value: $cnameValue"
    Write-Host "TTL: 300"
    
} catch {
    Write-Host "❌ Failed to get validation records: $_"
    exit 1
}

# Step 3: Create Route 53 Hosted Zone
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

Write-Host "`n📋 Next Steps:"
Write-Host "1. Wait 5-10 minutes for DNS validation"
Write-Host "2. Check certificate status: aws acm describe-certificate --certificate-arn $certArn"
Write-Host "3. Once validated, run the HTTPS setup script"
Write-Host "`n🔍 Certificate ARN: $certArn"
Write-Host "🔍 Zone ID: $zoneId"
