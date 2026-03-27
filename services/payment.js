const axios = require('axios');

class PaymobService {
    constructor() {
        this.apiKey = process.env.PAYMOB_API_KEY;
        this.integrationId = process.env.PAYMOB_INTEGRATION_ID;
        this.walletIntegrationId = process.env.PAYMOB_WALLET_INTEGRATION_ID;
        this.cardIntegrationId = process.env.PAYMOB_CARD_INTEGRATION_ID;
        this.hmacSecret = process.env.PAYMOB_HMAC_SECRET;
        this.iframeId = process.env.PAYMOB_IFRAME_ID;
        
        // Paymob API URLs
        this.baseURL = 'https://accept.paymob.com/api';
        this.authURL = 'https://accept.paymob.com/api/auth/tokens';
    }

    // Get authentication token
    async getAuthToken() {
        try {
            const response = await axios.post(this.authURL, {
                api_key: this.apiKey
            }, {
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            return response.data.token;
        } catch (error) {
            console.error('Paymob auth error:', error);
            throw new Error('Failed to authenticate with Paymob');
        }
    }

    // Create payment intent for subscription
    async createPaymentIntent(amount, tier, userId, userEmail) {
        try {
            const token = await this.getAuthToken();
            
            // Define tier details
            const tierDetails = this.getTierDetails(tier);
            
            const paymentData = {
                amount: amount * 100, // Convert to cents
                currency: 'EGP',
                payment_methods: ['card', 'wallet'],
                billing_data: {
                    name: userEmail,
                    email: userEmail,
                    description: `Anonymous Defenders - ${tierDetails.name} Subscription`
                },
                items: [{
                    name: `${tierDetails.name} Subscription`,
                    amount_cents: amount * 100,
                    description: `${tierDetails.uploads} uploads per month - ${tierDetails.name} tier`,
                    quantity: 1
                }]
            };

            const response = await axios.post(
                `${this.baseURL}/acceptance/payment_keys`,
                paymentData,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            // Save payment intent to database
            await this.savePaymentIntent({
                userId,
                tier,
                amount,
                paymentKey: response.data.payment_key,
                status: 'pending'
            });

            return {
                success: true,
                paymentKey: response.data.payment_key,
                iframeId: this.iframeId,
                amount,
                tierDetails
            };

        } catch (error) {
            console.error('Create payment intent error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Get tier details
    getTierDetails(tier) {
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

        return tiers[tier] || tiers['A'];
    }

    // Verify webhook signature
    verifyWebhookSignature(payload, signature) {
        const crypto = require('crypto');
        
        // Calculate expected signature
        const expectedSignature = crypto
            .createHmac('sha512', this.hmacSecret)
            .update(JSON.stringify(payload))
            .digest('hex');

        // Compare signatures
        return crypto.timingSafeEqual(
            Buffer.from(signature),
            Buffer.from(expectedSignature)
        );
    }

    // Process Paymob webhook
    async processWebhook(payload, signature) {
        try {
            // Verify webhook signature
            if (!this.verifyWebhookSignature(payload, signature)) {
                throw new Error('Invalid webhook signature');
            }

            const { type, obj } = payload;

            if (type === 'TRANSACTION') {
                await this.handleTransaction(obj);
            } else if (type === 'PAYMENT') {
                await this.handlePayment(obj);
            }

            return { success: true };

        } catch (error) {
            console.error('Webhook processing error:', error);
            return { success: false, error: error.message };
        }
    }

    // Handle transaction webhook
    async handleTransaction(transaction) {
        try {
            const { success, pending, amount_cents, is_auth, is_capture, is_voided, is_refunded } = transaction;
            
            if (success && !pending && is_capture) {
                // Payment successful
                await this.updatePaymentStatus(transaction.hmac, 'completed');
                await this.activateSubscription(transaction.hmac);
            } else if (is_voided || is_refunded) {
                // Payment failed/refunded
                await this.updatePaymentStatus(transaction.hmac, 'failed');
            }

        } catch (error) {
            console.error('Handle transaction error:', error);
        }
    }

    // Handle payment webhook
    async handlePayment(payment) {
        try {
            const { success, pending, amount_cents } = payment;
            
            if (success && !pending) {
                await this.updatePaymentStatus(payment.hmac, 'completed');
                await this.activateSubscription(payment.hmac);
            }

        } catch (error) {
            console.error('Handle payment error:', error);
        }
    }

    // Save payment intent to database (placeholder)
    async savePaymentIntent(paymentData) {
        // In production, save to PaymentIntents collection
        console.log('Saving payment intent:', paymentData);
    }

    // Update payment status (placeholder)
    async updatePaymentIntent(paymentKey, status) {
        // In production, update PaymentIntents collection
        console.log(`Updating payment ${paymentKey} to status: ${status}`);
    }

    // Activate subscription (placeholder)
    async activateSubscription(paymentKey) {
        // In production, update User collection
        console.log(`Activating subscription for payment: ${paymentKey}`);
    }
}

module.exports = PaymobService;
