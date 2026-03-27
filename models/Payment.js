const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    tier: { type: String, enum: ['A', 'B', 'C', 'D'], required: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'EGP' },
    paymentKey: { type: String, required: true, unique: true },
    status: { type: String, enum: ['pending', 'completed', 'failed', 'cancelled'], default: 'pending' },
    paymentMethod: { type: String, enum: ['card', 'wallet'], required: true },
    transactionId: { type: String, sparse: true },
    hmac: { type: String, required: true }, // Paymob HMAC for verification
    webhookData: { type: mongoose.Schema.Types.Mixed, sparse: true },
    createdAt: { type: Date, default: Date.now },
    completedAt: { type: Date, sparse: true }
}, { timestamps: true });

module.exports = mongoose.model('Payment', paymentSchema);
