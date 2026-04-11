const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    tier: { type: String, enum: ['A', 'B', 'C', 'D'], required: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'EGP' },
    orderId: { type: String, required: true, unique: true },
    status: { type: String, enum: ['pending', 'completed', 'failed', 'cancelled'], default: 'pending' },
    transactionId: { type: String, sparse: true },
    paymentData: { type: mongoose.Schema.Types.Mixed },
    createdAt: { type: Date, default: Date.now },
    completedAt: { type: Date, sparse: true }
}, { timestamps: true });

module.exports = mongoose.model('Payment', paymentSchema);
