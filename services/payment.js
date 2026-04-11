const axios = require('axios');
const crypto = require('crypto');
const Payment = require('../models/Payment');
const User = require('../models/User');

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
        this.orderURL = 'https://accept.paymob.com/api/ecommerce/orders';
        this.paymentKeyURL = 'https://accept.paymob.com/api/acceptance/payment_keys';
    }

    // 1. Get authentication token
    async getAuthToken() {
        try {
            const response = await axios.post(this.authURL, {
                api_key: this.apiKey
            });
            return response.data.token;
        } catch (error) {
            console.error('Paymob auth error:', error?.response?.data || error.message);
            throw new Error('Failed to authenticate with Paymob');
        }
    }

    // 2. Register Order
    async registerOrder(token, amountCents, tierDetails) {
        try {
            const response = await axios.post(this.orderURL, {
                auth_token: token,
                delivery_needed: "false",
                amount_cents: amountCents,
                currency: "EGP",
                items: [{
                    name: `${tierDetails.name} Subscription`,
                    amount_cents: amountCents,
                    description: `${tierDetails.uploads} uploads/month`,
                    quantity: "1"
                }]
            });
            return response.data.id; // Returns the Order ID
        } catch (error) {
            console.error('Paymob order error:', error?.response?.data || error.message);
            throw new Error('Failed to register order with Paymob');
        }
    }

    // 3. Create Payment Intent (Auth -> Order -> Payment Key)
    async createPaymentIntent(amount, tier, userId, userEmail, method = 'card') {
        try {
            // 1. Get Auth Token
            const token = await this.getAuthToken();
            
            // Define tier details
            const tierDetails = this.getTierDetails(tier);
            const amountCents = amount * 100;
            
            // 2. Order Registration
            const orderData = {
                auth_token: token,
                delivery_needed: "false",
                amount_cents: amountCents,
                currency: "EGP",
                items: [{
                    name: `${tierDetails.name} Subscription`,
                    amount_cents: amountCents,
                    description: `${tierDetails.uploads} uploads per month - ${tierDetails.name} tier`,
                    quantity: "1"
                }]
            };

            const orderResponse = await axios.post(
                `${this.baseURL}/ecommerce/orders`,
                orderData,
                { headers: { 'Content-Type': 'application/json' } }
            );
            
            const orderId = orderResponse.data.id;

            // Select Integration ID based on method
            let integrationId = this.integrationId; // Default
            if (method === 'wallet') {
                integrationId = this.walletIntegrationId;
            } else if (method === 'card') {
                integrationId = this.cardIntegrationId;
            }

            // 3. Payment Key Generation
            const paymentKeyData = {
                auth_token: token,
                amount_cents: amountCents,
                expiration: 3600,
                order_id: orderId,
                billing_data: {
                    apartment: "NA", 
                    email: userEmail, 
                    floor: "NA", 
                    first_name: userEmail.split('@')[0], 
                    street: "NA", 
                    building: "NA", 
                    phone_number: "NA", 
                    shipping_method: "NA", 
                    postal_code: "NA", 
                    city: "NA", 
                    country: "EG", 
                    last_name: "User", 
                    state: "NA"
                },
                currency: "EGP",
                integration_id: integrationId
            };

            const paymentKeyResponse = await axios.post(
                `${this.baseURL}/acceptance/payment_keys`,
                paymentKeyData,
                { headers: { 'Content-Type': 'application/json' } }
            );

            // Save payment intent to database
            await this.savePaymentIntent({
                userId,
                tier,
                amount,
                orderId: orderId,
                status: 'pending'
            });

            return {
                success: true,
                paymentKey: paymentKeyResponse.data.token,
                iframeId: this.iframeId,
                amount,
                tierDetails
            };

        } catch (error) {
            console.error('Create payment intent error:', error?.response?.data || error.message);
            return {
                success: false,
                error: 'Failed to initialize payment gateway'
            };
        }
    }

    // Get tier details
    getTierDetails(tier) {
        const tiers = {
            'A': { name: 'Tier A', uploads: 10, price: 300, description: 'Basic plan' },
            'B': { name: 'Tier B', uploads: 25, price: 600, description: 'Standard plan' },
            'C': { name: 'Tier C', uploads: 50, price: 1200, description: 'Premium plan' },
            'D': { name: 'Tier D', uploads: 100, price: 2400, description: 'Enterprise plan' }
        };
        return tiers[tier] || tiers['A'];
    }

    // Verify webhook signature (HMAC)
    verifyWebhookSignature(payload, hmacFromHeader) {
        try {
            if (!payload || !payload.obj) return false;
            
            const obj = payload.obj;
            
            // Paymob requires concatenating these specific fields in alphabetical order
            // Note: The order and selection of fields must match Paymob's documentation exactly
            const orderId = obj.order ? obj.order.id : '';
            const sourceDataPan = obj.source_data ? obj.source_data.pan : '';
            const sourceDataSubType = obj.source_data ? obj.source_data.sub_type : '';
            const sourceDataType = obj.source_data ? obj.source_data.type : '';
            
            // Ensure boolean values are converted to 'true'/'false' strings
            const formatBool = (val) => val === true ? 'true' : (val === false ? 'false' : val);
            
            const dataString = 
                `${obj.amount_cents}` +
                `${obj.created_at}` +
                `${obj.currency}` +
                `${formatBool(obj.error_occured)}` +
                `${formatBool(obj.has_parent_transaction)}` +
                `${obj.id}` +
                `${obj.integration_id}` +
                `${formatBool(obj.is_3d_secure)}` +
                `${formatBool(obj.is_auth)}` +
                `${formatBool(obj.is_capture)}` +
                `${formatBool(obj.is_refunded)}` +
                `${formatBool(obj.is_standalone_payment)}` +
                `${formatBool(obj.is_voided)}` +
                `${orderId}` +
                `${obj.owner}` +
                `${formatBool(obj.pending)}` +
                `${sourceDataPan}` +
                `${sourceDataSubType}` +
                `${sourceDataType}` +
                `${formatBool(obj.success)}`;

            const expectedSignature = crypto
                .createHmac('sha512', this.hmacSecret)
                .update(dataString)
                .digest('hex');

            const isValid = expectedSignature === hmacFromHeader;
            if (!isValid) {
                console.error('HMAC Verification Failed. Expected:', expectedSignature, 'Received:', hmacFromHeader);
            }
            return isValid;
        } catch (error) {
            console.error('Error during HMAC verification:', error);
            return false;
        }
    }

    // Process Paymob webhook
    async processWebhook(payload, hmacFromHeader) {
        try {
            // Verify webhook signature
            if (!this.verifyWebhookSignature(payload, hmacFromHeader)) {
                console.error('Paymob Webhook HMAC Mismatch');
                throw new Error('Invalid webhook signature');
            }

            const { type, obj } = payload;

            if (type === 'TRANSACTION') {
                await this.handleTransaction(obj);
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
            const { success, pending, order } = transaction;
            
            if (success && !pending) {
                // Payment successful
                const orderId = order ? order.id : null;
                if (orderId) {
                    await this.updatePaymentStatus(orderId, 'completed');
                    await this.activateSubscription(orderId);
                }
            } else if (!success) {
                // Payment failed
                const orderId = order ? order.id : null;
                if (orderId) {
                    await this.updatePaymentStatus(orderId, 'failed');
                }
            }

        } catch (error) {
            console.error('Handle transaction error:', error);
        }
    }

    // Save payment intent to database
    async savePaymentIntent(paymentData) {
        const Payment = require('../models/Payment');
        try {
            await Payment.create({
                user: paymentData.userId,
                tier: paymentData.tier,
                amount: paymentData.amount,
                orderId: paymentData.orderId,
                status: paymentData.status
            });
        } catch (error) {
            console.error('Error saving Payment to DB:', error);
        }
    }

    // Update payment status
    async updatePaymentStatus(orderId, status) {
        const Payment = require('../models/Payment');
        try {
            await Payment.findOneAndUpdate(
                { orderId: orderId },
                { status: status }
            );
        } catch (error) {
            console.error(`Error updating payment ${orderId} to status: ${status}`, error);
        }
    }

    // Activate subscription
    async activateSubscription(orderId) {
        const Payment = require('../models/Payment');
        const User = require('../models/User');
        try {
            const payment = await Payment.findOne({ orderId: orderId });
            if (!payment) return;
            
            // Replay Attack Protection: Check if payment was already successfully processed
            if (payment.status === 'completed') {
                console.log(`Payment for order ${orderId} is already completed. Skipping.`);
                return;
            }

            const user = await User.findById(payment.user);
            if (!user) return;

            const tierDetails = this.getTierDetails(payment.tier);
            
            // Set subscription dates
            const startDate = new Date();
            const endDate = new Date();
            endDate.setMonth(endDate.getMonth() + 1); // 1 month duration

            // Update user document using the flat fields defined in User.js schema
            await User.findByIdAndUpdate(user._id, {
                subscriptionTier: payment.tier,
                isActiveSubscription: true,
                subscriptionStartDate: startDate,
                subscriptionEndDate: endDate,
                uploadQuota: tierDetails.uploads,
                // Reset usage on new/renewed subscription
                uploadCount: 0
            });
            
            console.log(`Successfully activated subscription ${payment.tier} for user ${user.email}`);
        } catch (error) {
            console.error(`Error activating subscription for order: ${orderId}`, error);
        }
    }
}
