# AWS SNS SMS Infrastructure Setup Guide

## Prerequisites
- AWS Account with SMS production access approved
- AWS CLI configured
- Node.js and Convex CLI installed

## Step 1: AWS SNS Configuration

### Request Production Access
1. Go to AWS SNS Console → Text messaging (SMS) → Sandbox
2. Click "Request production access"
3. Fill out the form with business details
4. Wait for approval (24-48 hours)

### Set Up Origination Identity
Choose one:

**Option A: Sender ID (Free)**
```bash
# Go to AWS SNS → Text messaging → Sender IDs
# Register: DojoApp, EventApp, or similar (3-11 alphanumeric characters)
```

**Option B: Dedicated Phone Number ($1-2/month)**
```bash
# Go to AWS SNS → Text messaging → Phone numbers
# Purchase a toll-free number
```

### Configure SMS Attributes
```bash
aws sns set-sms-attributes \
  --attributes \
    DefaultSMSType=Transactional \
    MonthlySpendLimit=100 \
    DeliveryStatusLogging=enabled \
    DefaultSenderID=DojoApp
```

## Step 2: Environment Configuration

### Production Environment Variables
```bash
# apps/convex/.env.local
AWS_ACCESS_KEY_ID=your-production-access-key
AWS_SECRET_ACCESS_KEY=your-production-secret-key
AWS_REGION=us-east-1
AWS_SNS_SENDER_ID=DojoApp
AWS_SNS_MONTHLY_SPEND_LIMIT=100
```

### Development/Staging
```bash
# Use same credentials but with lower spend limit
AWS_SNS_MONTHLY_SPEND_LIMIT=10
```

## Step 3: Monitoring Setup

### CloudWatch Dashboard
1. Create dashboard: "SMS-Infrastructure"
2. Add widgets for:
   - SMS delivery metrics
   - Monthly costs
   - Opt-out rates
   - Error rates

### Cost Alerts
```bash
aws budgets create-budget \
  --account-id YOUR_ACCOUNT_ID \
  --budget '{
    "BudgetName": "SMS-Monthly-Budget",
    "BudgetLimit": {
      "Amount": "100",
      "Unit": "USD"
    },
    "TimeUnit": "MONTHLY",
    "BudgetType": "COST",
    "CostFilters": {
      "Service": ["Amazon Simple Notification Service"]
    }
  }'
```

## Step 4: Testing

### Test Production SMS
```javascript
// In Convex dashboard
await convex.action("smsInfrastructure:sendProductionSms", {
  phoneNumber: "+1234567890",
  message: "Production SMS test from Dojo Events",
  messageType: "Transactional",
  senderId: "DojoApp"
});
```

### Test Cost Monitoring
```javascript
// Check usage
await convex.action("smsInfrastructure:getSmsStatistics", {
  startDate: Date.now() - 30 * 24 * 60 * 60 * 1000, // 30 days ago
  endDate: Date.now()
});
```

## Step 5: Go Live

### Enable SMS Features
1. Update environment variables in production
2. Deploy Convex functions
3. Test approval SMS workflow
4. Test text blast campaigns
5. Monitor for 24 hours

### Launch Checklist
- [ ] Production access approved
- [ ] Origination identity configured
- [ ] Environment variables set
- [ ] Monitoring dashboard created
- [ ] Cost alerts configured
- [ ] Test messages sent successfully
- [ ] Opt-out handling tested
- [ ] Error handling verified

## Ongoing Operations

### Daily Monitoring
- Check CloudWatch dashboard
- Review opt-out reports
- Monitor costs vs budget

### Weekly Reports
- SMS delivery success rate
- Cost per message trends
- Popular message types
- Geographic distribution

### Monthly Reviews
- Total SMS costs
- Optimize message templates
- Review opt-out patterns
- Plan capacity for growth

## Troubleshooting

### Common Issues
1. **Messages not delivering**: Check sandbox mode, phone verification
2. **High costs**: Review message length, reduce unnecessary messages
3. **Opt-outs increasing**: Review message frequency and content
4. **Delivery delays**: Check AWS service health, regional issues

### Support Contacts
- AWS Support: For infrastructure issues
- Convex Support: For backend integration issues
- Internal team: For application-specific issues

## Cost Optimization

### Best Practices
1. Use transactional messages only when necessary
2. Optimize message length (stay under 160 characters)
3. Implement smart retry logic
4. Monitor and remove inactive phone numbers
5. Use templates to avoid duplicate content

### Expected Costs
- US SMS: ~$0.00645 per message
- International: Varies by country ($0.02-0.10+)
- Dedicated phone number: $1-2/month
- Sender ID: Free

## Compliance

### TCPA Compliance
- Always get explicit opt-in consent
- Provide clear opt-out instructions
- Maintain opt-out records
- Respect opt-out requests immediately

### GDPR Compliance
- Hash/encrypt phone numbers in logs
- Provide data deletion capabilities
- Document data processing purposes
- Implement consent management