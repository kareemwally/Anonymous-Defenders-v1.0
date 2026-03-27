const express = require('express');
const router = express.Router();
const User = require('../models/User');
const PaymobService = require('../services/payment');

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
                description: 'Premium plan for power users'
            },
            'D': {
                name: 'Tier D',
                uploads: 100,
                price: 2400,
                description: 'Enterprise plan for teams'
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
router.post('/create-payment-intent/:tier', async (req, res) => {
    try {
        const { tier } = req.params;
        const userId = req.user ? req.user._id : null;
        const userEmail = req.user ? req.user.email : req.body.email;

        // Validate tier
        const validTiers = ['A', 'B', 'C', 'D'];
        if (!validTiers.includes(tier)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid subscription tier'
            });
        }

        const paymobService = new PaymobService();
        const tierDetails = paymobService.getTierDetails(tier);

        // Create payment intent
        const paymentResult = await paymobService.createPaymentIntent(
            tierDetails.price,
            tier,
            userId,
            userEmail
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
router.get('/status', async (req, res) => {
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
        const currentTier = user.subscriptionTier || 'Free';
        const tierDetails = user.subscriptionTier ? paymobService.getTierDetails(user.subscriptionTier) : {
            name: 'Free',
            uploads: 3,
            price: 0,
            description: 'Guest user with limited uploads'
        };

        res.status(200).json({
            success: true,
            subscription: {
                tier: currentTier,
                tierDetails,
                uploadQuota: user.uploadQuota,
                uploadCount: user.uploadCount,
                remainingUploads: user.uploadQuota - user.uploadCount,
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

// Cancel subscription
router.post('/cancel', async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }

        const user = await User.findByIdAndUpdate(req.user._id, {
            isActiveSubscription: false,
            subscriptionEndDate: new Date()
        });

        res.status(200).json({
            success: true,
            message: 'Subscription cancelled successfully'
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
router.post('/upgrade/:tier', async (req, res) => {
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
        const signature = req.headers['hmac-sha512'];
        const payload = req.body;

        const paymobService = new PaymobService();
        const result = await paymobService.processWebhook(payload, signature);

        if (result.success) {
            res.status(200).json({ success: true });
        } else {
            res.status(400).json({ 
                success: false, 
                error: result.error 
            });
        }

    } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).json({
            success: false,
            error: 'Webhook processing failed'
        });
    }
});

module.exports = router;
