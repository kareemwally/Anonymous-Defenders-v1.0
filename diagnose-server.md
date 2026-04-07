# 🔍 Server Diagnosis Guide

## 📋 Current Situation
- **GitHub Actions:** Workflow completed successfully ✅
- **Load Balancer URL:** `http://anonymous-defenders-alb-593198813.us-east-1.elb.amazonaws.com`
- **Server Status:** ❌ Not responding (timeout)

## 🔍 Diagnosis Steps

### 1. Check GitHub Actions
**URL:** https://github.com/kareemwally/Anonymous-Defenders-v1.0/actions

**What to look for:**
- ✅ Build succeeded
- ✅ Docker image pushed to ECR
- ✅ ECS task definition updated
- ✅ ECS service updated
- ❌ Any errors in deployment logs

### 2. Check ECS Service Status
**AWS Console → ECS → Clusters → anonymous-defenders → Services**

**What to check:**
- **Service Status:** Should be "ACTIVE"
- **Running Count:** Should be > 0
- **Desired Count:** Should be > 0
- **Task Definition:** Should match latest revision

### 3. Check Load Balancer Health
**AWS Console → EC2 → Load Balancers → anonymous-defenders-alb**

**What to check:**
- **State:** Should be "active"
- **Health Checks:** Should be passing
- **Target Groups:** Should be healthy
- **Listeners:** Should have HTTP (80) and HTTPS (443)

### 4. Check Security Groups
**AWS Console → EC2 → Security Groups**

**What to check:**
- **Inbound Rules:** Should allow HTTP (80) and HTTPS (443)
- **Outbound Rules:** Should allow all traffic
- **Source:** Should be 0.0.0.0/0 (anywhere)

### 5. Check CloudWatch Logs
**AWS Console → CloudWatch → Log Groups → /ecs/anonymous-defenders**

**What to look for:**
- **Application startup errors**
- **Database connection issues**
- **Port binding errors**
- **Environment variable issues**

## 🚀 Quick Fixes

### Fix 1: Restart ECS Service
```bash
aws ecs update-service \
    --cluster anonymous-defenders \
    --service anonymous-defenders-service \
    --force-new-deployment
```

### Fix 2: Check Task Definition
```bash
aws ecs describe-task-definition \
    --task-definition anonymous-defenders
```

### Fix 3: Check Load Balancer
```bash
aws elbv2 describe-load-balancers \
    --names anonymous-defenders-alb
```

### Fix 4: Check Security Groups
```bash
aws ec2 describe-security-groups \
    --group-names sg-xxxxxxxx
```

## 🎯 Most Likely Issues

### 1. ECS Tasks Not Running
**Symptoms:**
- Load Balancer responds with timeouts
- No actual servers behind the load balancer

**Fix:**
- Check ECS service configuration
- Verify task definition is valid
- Check resource limits (CPU/Memory)

### 2. Security Group Blocking Traffic
**Symptoms:**
- Connection refused
- Timeout errors
- Load balancer can't reach tasks

**Fix:**
- Add inbound rules for HTTP/HTTPS
- Check network ACLs
- Verify VPC configuration

### 3. Application Not Starting
**Symptoms:**
- Tasks are running but not responding
- Health checks failing
- Application errors in logs

**Fix:**
- Check application startup logs
- Verify environment variables
- Check port configuration (should be 3000)

## 🌐 Manual Testing

### Test with Browser
1. Open: `http://anonymous-defenders-alb-593198813.us-east-1.elb.amazonaws.com`
2. Check for any response
3. Check browser console for errors

### Test with curl
```bash
curl -v http://anonymous-defenders-alb-593198813.us-east-1.elb.amazonaws.com
```

### Test API Endpoints
```bash
curl -X GET http://anonymous-defenders-alb-593198813.us-east-1.elb.amazonaws.com/api/v1/status
```

## 📊 Expected Results

### Working Server:
- **Status Code:** 200 OK
- **Response Time:** < 5 seconds
- **API Endpoints:** Responding correctly
- **Load Balancer:** Green status

### Broken Server:
- **Status Code:** Timeout/Connection refused
- **Response Time:** > 10 seconds
- **API Endpoints:** Not responding
- **Load Balancer:** Red status

## 🎯 Next Steps

1. **Check GitHub Actions** for deployment errors
2. **Verify ECS service** is running tasks
3. **Check Load Balancer** health status
4. **Review CloudWatch logs** for errors
5. **Test endpoints** manually
6. **Fix configuration** issues found

---

**🔍 Start with GitHub Actions check!**
