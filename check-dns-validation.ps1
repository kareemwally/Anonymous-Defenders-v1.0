# Check DNS Validation Status
Write-Host "=== DNS Validation Status Check ==="

# Check CNAME record
Write-Host "1. Checking CNAME record..."
try {
    $cname = nslookup _3ab6420eb65b23842c0b9b599e9faf54.anonymous-defenders.com
    Write-Host "CNAME lookup result:"
    $cname
} catch {
    Write-Host "❌ Failed to lookup CNAME: $_"
}

# Check domain availability
Write-Host "`n2. Checking domain availability..."
try {
    $whois = whois anonymous-defenders.com
    Write-Host "Domain whois result:"
    $whois | Select-Object -First 10
} catch {
    Write-Host "❌ Failed to check whois: $_"
}

# Check certificate status
Write-Host "`n3. Checking certificate status..."
Write-Host "Please check in AWS Console:"
Write-Host "1. Go to Certificate Manager (ACM)"
Write-Host "2. Find your certificate"
Write-Host "3. Check the validation status"
Write-Host "4. Check the DNS validation records"

Write-Host "`n=== Troubleshooting Steps ==="
Write-Host "1. Verify domain ownership"
Write-Host "2. Check DNS propagation"
Write-Host "3. Verify CNAME records"
Write-Host "4. Check domain registration"
Write-Host "5. Consider using a different domain"

Write-Host "`n=== Alternative Solutions ==="
Write-Host "1. Use a different domain name"
Write-Host "2. Use AWS Route 53 as DNS provider"
Write-Host "3. Use Cloudflare for DNS management"
Write-Host "4. Use the ALB domain with SSL (free option)"
