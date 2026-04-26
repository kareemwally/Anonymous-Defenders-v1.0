const express = require('express');
const router = express.Router();
const User = require('../models/User');
const PaymobService = require('../services/payment');
const auth = require('../middleware/auth');

// Subscription Plan Limits
const planLimits = {
    'free': { uploads: 3, name: 'Free' },
    'A': { uploads: 10, name: 'Tier A' },
    'B': { uploads: 25, name: 'Tier B' },
    'C': { uploads: 50, name: 'Tier C' },
    'D': { uploads: 100, name: 'Tier D' }
};

// Get subscription tiers
router.get('/tiers', async (req, res) => {
    try {
        const tiers = {
            'A': {
                name: 'Tier A',
                uploads: 10,
                price: 300,
                description: 'Basic plan for casual users'
            },
            'B': {
                name: 'Tier B',
                uploads: 25,
                price: 600,
                description: 'Standard plan for regular users'
            },
            'C': {
                name: 'Tier C',
                uploads: 50,
                price: 1200,
                description: 'Team plan — up to 5 members, each with 50 uploads/month'
            },
            'D': {
                name: 'Tier D',
                uploads: 100,
                price: 2400,
                description: 'Enterprise team plan — up to 10 members, each with 100 uploads/month'
            }
        };

        res.status(200).json({
            success: true,
            tiers
        });

    } catch (error) {
        console.error('Get tiers error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get subscription tiers'
        });
    }
});

// Create payment intent for subscription
router.post('/create-payment-intent/:tier', auth, async (req, res) => {
    try {
        const { tier } = req.params;
        const validTiers = ['A', 'B', 'C', 'D'];
        if (!validTiers.includes(tier)) {
            return res.status(400).json({ success: false, error: `Invalid subscription tier. Must be one of: ${validTiers.join(', ')}` });
        }
        const { method = 'card', email } = req.body;
        const userId = req.user ? req.user._id : null;
        const userEmail = req.user ? req.user.email : email;

        if (!userEmail) {
            return res.status(400).json({ success: false, error: 'Email is required' });
        }

        const paymobService = new PaymobService();
        const tierDetails = paymobService.getTierDetails(tier);

        // Create payment intent
        const paymentResult = await paymobService.createPaymentIntent(
            tierDetails.price,
            tier,
            userId,
            userEmail,
            method
        );

        if (paymentResult.success) {
            res.status(200).json({
                success: true,
                paymentKey: paymentResult.paymentKey,
                iframeId: paymentResult.iframeId,
                amount: paymentResult.amount,
                tier: paymentResult.tierDetails
            });
        } else {
            res.status(400).json({
                success: false,
                error: paymentResult.error
            });
        }

    } catch (error) {
        console.error('Create payment intent error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create payment intent'
        });
    }
});

// Get user subscription status
router.get('/status', auth, async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }

        const user = await User.findById(req.user._id);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        const paymobService = new PaymobService();
        const currentPlan = user.subscriptionTier || 'free';
        const limits = planLimits[currentPlan] || planLimits['free'];

        const tierDetails = user.subscriptionTier ? paymobService.getTierDetails(user.subscriptionTier) : {
            name: 'Free',
            uploads: 3,
            price: 0,
            description: 'Guest user with limited uploads'
        };

        res.status(200).json({
            success: true,
            subscription: {
                tier: currentPlan,
                tierDetails,
                uploadQuota: user.uploadQuota,
                uploadCount: user.uploadCount,
                remainingUploads: (user.uploadQuota || 3) - (user.uploadCount || 0),
                isActiveSubscription: user.isActiveSubscription,
                subscriptionStartDate: user.subscriptionStartDate,
                subscriptionEndDate: user.subscriptionEndDate
            }
            });
    } catch (error) {
        console.error('Get subscription status error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get subscription status'
        });
    }
});

// Cancel subscription (Stops renewal, but keeps service active until endDate)
router.post('/cancel', auth, async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }

        // Just set isActiveSubscription to false so it won't renew, 
        // but we DON'T change subscriptionEndDate so they keep their current access.
        await User.findByIdAndUpdate(req.user._id, {
            isActiveSubscription: false
        });
        
        res.status(200).json({
            success: true,
            message: 'Subscription renewal cancelled. You will still have access until your current period ends.'
        });
    } catch (error) {
        console.error('Cancel subscription error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to cancel subscription'
        });
    }
});

// Upgrade subscription
router.post('/upgrade/:tier', auth, async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }
        const { tier } = req.params;
        const validTiers = ['A', 'B', 'C', 'D'];
        
        if (!validTiers.includes(tier)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid subscription tier'
            });
        }
        const paymobService = new PaymobService();
        const tierDetails = paymobService.getTierDetails(tier);

        // Create payment intent for upgrade
        const paymentResult = await paymobService.createPaymentIntent(
            tierDetails.price,
            tier,
            req.user._id,
            req.user.email
        );
        if (paymentResult.success) {
            res.status(200).json({
                success: true,
                message: 'Payment intent created for upgrade',
                paymentKey: paymentResult.paymentKey,
                iframeId: paymentResult.iframeId,
                newTier: tierDetails
            });
        } else {
            res.status(400).json({
                success: false,
                error: paymentResult.error
            });
        }

    } catch (error) {
        console.error('Upgrade subscription error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create upgrade payment'
        });
    }
});

// Paymob webhook endpoint
router.post('/webhook', async (req, res) => {
    try {
        // Paymob can send HMAC in query params or headers
        const hmac = req.query.hmac || req.headers['hmac'] || req.headers['hmac-sha512'];
        const payload = req.body;

        if (!hmac) {
            console.error('Webhook Error: Missing HMAC signature');
            return res.status(400).json({ success: false, error: 'Missing HMAC signature' });
        }

        const paymobService = new PaymobService();
        
        // Process the webhook and verify HMAC internally in the service
        const result = await paymobService.processWebhook(payload, hmac);

        if (result.success) {
            // Paymob expects a 200 OK status to acknowledge receipt
            res.status(200).send('success');
        } else {
            console.error('Webhook Processing Failed:', result.error);
            // We return 200 anyway so Paymob doesn't keep retrying 
            res.status(200).send('acknowledged but failed');
        }

    } catch (error) {
        console.error('Webhook Route Error:', error);
        res.status(500).send('internal server error');
    }
});

module.exports = router;

