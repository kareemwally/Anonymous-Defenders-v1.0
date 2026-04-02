# 🔒 Manual SSL Certificate Setup

## 📋 Step-by-Step Guide

### Step 1: Request SSL Certificate
```bash
aws acm request-certificate \
    --domain-name anonymous-defenders.com \
    --subject-alternative-names www.anonymous-defenders.com \
    --validation-method DNS
```

### Step 2: Get DNS Validation Records
```bash
aws acm describe-certificate \
    --certificate-arn YOUR_CERTIFICATE_ARN \
    --query 'Certificate.DomainValidationOptions[0]'
```

### Step 3: Create Route 53 Hosted Zone
```bash
aws route53 create-hosted-zone \
    --name anonymous-defenders.com \
    --caller-reference "anonymous-defenders-$(date +%Y%m%d%H%M%S)"
```

### Step 4: Create DNS Validation Records
```bash
aws route53 change-resource-record-sets \
    --hosted-zone-id YOUR_ZONE_ID \
    --change-batch '{
        "Changes": [
            {
                "Action": "CREATE",
                "ResourceRecordSet": {
                    "Name": "_xxxxxxxx.anonymous-defenders.com",
                    "Type": "CNAME",
                    "TTL": 300,
                    "ResourceRecords": [
                        {
                            "Value": "_xxxxxxxx.acm-validations.aws"
                        }
                    ]
                }
            }
        ]
    }'
```

### Step 5: Wait for Certificate Validation
```bash
aws acm describe-certificate \
    --certificate-arn YOUR_CERTIFICATE_ARN \
    --query 'Certificate.Status'
```

### Step 6: Create HTTPS Listener
```bash
aws elbv2 create-listener \
    --load-balancer-arn YOUR_ALB_ARN \
    --protocol HTTPS \
    --port 443 \
    --certificates CertificateArn=YOUR_CERTIFICATE_ARN \
    --default-actions Type=forward,TargetGroupArn=YOUR_TARGET_GROUP_ARN
```

### Step 7: Create HTTP to HTTPS Redirect
```bash
aws elbv2 create-listener \
    --load-balancer-arn YOUR_ALB_ARN \
    --protocol HTTP \
    --port 80 \
    --default-actions Type=redirect,Config='{"Protocol":"HTTPS","Port":"443","StatusCode":"HTTP_301"}'
```

### Step 8: Create A Record for Load Balancer
```bash
aws route53 change-resource-record-sets \
    --hosted-zone-id YOUR_ZONE_ID \
    --change-batch '{
        "Changes": [
            {
                "Action": "CREATE",
                "ResourceRecordSet": {
                    "Name": "anonymous-defenders.com",
                    "Type": "A",
                    "AliasTarget": {
                        "DNSName": "anonymous-defenders-alb-593198813.us-east-1.elb.amazonaws.com",
                        "EvaluateTargetHealth": false,
                        "HostedZoneId": "Z35SXDOTRQ7X7K"
                    }
                }
            }
        ]
    }'
```

## 🎯 Quick Start Commands

### 1. Request Certificate
```bash
aws acm request-certificate \
    --domain-name anonymous-defenders.com \
    --subject-alternative-names www.anonymous-defenders.com \
    --validation-method DNS
```

### 2. Get Current Resources
```bash
# Get Load Balancer ARN
aws elbv2 describe-load-balancers --names anonymous-defenders-alb

# Get Target Group ARN
aws elbv2 describe-target-groups --names anonymous-defenders-tg

# Get Hosted Zone
aws route53 list-hosted-zones
```

### 3. Update Environment Variables
```json
{
    "name": "FRONTEND_URL",
    "value": "https://anonymous-defenders.com"
},
{
    "name": "PLOTS_BASE_URL",
    "value": "https://anonymous-defenders.com"
},
{
    "name": "OAUTH_CALLBACK_BASE",
    "value": "https://anonymous-defenders.com"
}
```

## 🌐 Expected Results

### After Setup:
- **HTTPS URL:** `https://anonymous-defenders.com`
- **HTTP Redirect:** `http://anonymous-defenders.com` → `https://anonymous-defenders.com`
- **SSL Certificate:** Valid and trusted
- **Browser:** Green lock icon

## 📊 Cost Breakdown

### Monthly Costs:
- **Domain:** $12/year ($1/month)
- **Route 53:** $0.50/month
- **SSL Certificate:** $0/month (FREE)
- **Load Balancer:** ~$16/month (already paying)
- **Total:** ~$17.50/month

## 🎯 Next Steps

1. **Request SSL certificate**
2. **Create DNS validation records**
3. **Wait for validation (5-10 minutes)**
4. **Create HTTPS listener**
5. **Update environment variables**
6. **Test HTTPS**

---

**🔒 Ready to secure your API with HTTPS!**
