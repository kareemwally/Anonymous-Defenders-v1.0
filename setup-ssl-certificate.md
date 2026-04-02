# 🔒 SSL Certificate Setup for HTTPS

## 📋 Current Situation
- **Load Balancer:** `anonymous-defenders-alb-593198813.us-east-1.elb.amazonaws.com`
- **Current Protocol:** HTTP (not secure)
- **Need:** HTTPS with SSL certificate

## 🎯 SSL Certificate Options

### Option 1: AWS Certificate Manager (ACM) - Recommended
**Free SSL certificates from AWS**

#### Steps:
1. **Go to AWS Certificate Manager (ACM)**
2. **Request Certificate** → **Request a public certificate**
3. **Domain Name:** `anonymous-defenders.com` (or your custom domain)
4. **Validation Method:** DNS validation
5. **Create CNAME records** in DNS provider
6. **Wait for validation** (usually 1-2 hours)

### Option 2: Let's Encrypt + Route 53
**Free SSL certificates with automatic renewal**

#### Steps:
1. **Install Certbot** on EC2 instance
2. **Configure Route 53** for DNS challenges
3. **Generate certificate** with Let's Encrypt
4. **Upload to ACM** for Load Balancer

### Option 3: Cloudflare SSL
**Free SSL with Cloudflare CDN**

#### Steps:
1. **Create Cloudflare account**
2. **Add domain** to Cloudflare
3. **Configure DNS records**
4. **Enable SSL/TLS** in Cloudflare
5. **Point Load Balancer** to Cloudflare

## 🚀 Recommended Solution: AWS Certificate Manager

### Step 1: Request SSL Certificate
```bash
# Using AWS CLI
aws acm request-certificate \
    --domain-name anonymous-defenders.com \
    --validation-method DNS \
    --subject-alternative-names www.anonymous-defenders.com
```

### Step 2: Get DNS Validation Records
```bash
aws acm describe-certificate \
    --certificate-arn arn:aws:acm:us-east-1:117030212338:certificate/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

### Step 3: Create CNAME Records
**Add these records to your DNS provider:**
- **Name:** `_xxxxxxxx.anonymous-defenders.com`
- **Type:** CNAME
- **Value:** `_xxxxxxxx.acm-validations.aws`

### Step 4: Wait for Validation
```bash
aws acm describe-certificate \
    --certificate-arn arn:aws:acm:us-east-1:117030212338:certificate/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

### Step 5: Attach Certificate to Load Balancer
```bash
aws elbv2 create-listener \
    --load-balancer-arn arn:aws:elasticloadbalancing:us-east-1:117030212338:loadbalancer/app/anonymous-defenders-alb/xxxxxxxx \
    --protocol HTTPS \
    --port 443 \
    --certificates CertificateArn=arn:aws:acm:us-east-1:117030212338:certificate/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx \
    --default-actions Type=forward,TargetGroupArn=arn:aws:elasticloadbalancing:us-east-1:117030212338:targetgroup/anonymous-defenders-tg/xxxxxxxx
```

## 🔧 Load Balancer Configuration

### Update Load Balancer for HTTPS
```bash
# Add HTTPS listener
aws elbv2 create-listener \
    --load-balancer-arn $(aws elbv2 describe-load-balancers --names anonymous-defenders-alb --query 'LoadBalancers[0].LoadBalancerArn' --output text) \
    --protocol HTTPS \
    --port 443 \
    --certificates CertificateArn=arn:aws:acm:us-east-1:117030212338:certificate/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx \
    --default-actions Type=forward,TargetGroupArn=$(aws elbv2 describe-target-groups --names anonymous-defenders-tg --query 'TargetGroups[0].TargetGroupArn' --output text)

# Redirect HTTP to HTTPS
aws elbv2 create-listener \
    --load-balancer-arn $(aws elbv2 describe-load-balancers --names anonymous-defenders-alb --query 'LoadBalancers[0].LoadBalancerArn' --output text) \
    --protocol HTTP \
    --port 80 \
    --default-actions Type=redirect,Config={"Protocol":"HTTPS","Port":"443","StatusCode":"HTTP_301"}
```

## 🌐 Custom Domain Setup

### Step 1: Buy Custom Domain
- **GoDaddy**, **Namecheap**, or **Route 53**
- **Domain:** `anonymous-defenders.com`

### Step 2: Configure DNS
```bash
# A record for Load Balancer
aws route53 change-resource-record-sets \
    --hosted-zone-id Zxxxxxxxx \
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

## 🎯 Application Updates

### Update Environment Variables
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

### Update OAuth Callbacks
- **Google OAuth:** `https://anonymous-defenders.com/auth/google/callback`
- **GitHub OAuth:** `https://anonymous-defenders.com/auth/github/callback`

## 🚀 Quick Start

### Option 1: Use AWS Console (Easiest)
1. **Go to AWS Certificate Manager**
2. **Request Certificate**
3. **Follow DNS validation steps**
4. **Attach to Load Balancer**

### Option 2: Use AWS CLI (Advanced)
1. **Run the commands above**
2. **Wait for certificate validation**
3. **Update Load Balancer listeners**

## 📊 Expected Results

### Before HTTPS:
- **URL:** `http://anonymous-defenders-alb-593198813.us-east-1.elb.amazonaws.com`
- **Security:** Not secure
- **Browser:** "Not secure" warning

### After HTTPS:
- **URL:** `https://anonymous-defenders.com`
- **Security:** Secure with SSL
- **Browser:** Green lock icon

## 🎯 Next Steps

1. **Choose SSL option** (ACM recommended)
2. **Request certificate**
3. **Configure DNS**
4. **Update Load Balancer**
5. **Test HTTPS**
6. **Update environment variables**

---

**🔒 Ready to secure your API with HTTPS!**
