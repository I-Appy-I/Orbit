const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
    {
        username: {
            type: String,
            required: true,
            min: 4,
            max: 20,
            unique: true,
        },
        email: {
            type: String,
            required: true,
            max: 50,
            unique: true,
        },
        password: {
            type: String,
            required: true,
            min: 6,
            max: 30,
        },
        profilePic: {
            type: String,
        },
        isAdmin: {
            type: Boolean,
            required: true,
            default: false,
        },
        emailVerified: {
            type: Boolean,
            required: true,
            default: false,
        },
        emailVerificationTokenHash: {
            type: String,
            select: false,
        },
        emailVerificationExpires: {
            type: Date,
        },
        emailVerificationAttempts: {
            type: Number,
            default: 0,
            select: false,
        },
        emailVerificationLastSent: {
            type: Date,
        },
        pendingEmail: {
            type: String,
            max: 50,
            trim: true,
            lowercase: true,
        },
        pendingEmailVerificationTokenHash: {
            type: String,
            select: false,
        },
        pendingEmailVerificationExpires: {
            type: Date,
        },
        pendingEmailVerificationAttempts: {
            type: Number,
            default: 0,
            select: false,
        },
        pendingEmailVerificationLastSent: {
            type: Date,
        },
    }
);

userSchema.index({ emailVerificationTokenHash: 1 }, { sparse: true });
userSchema.index({ pendingEmailVerificationTokenHash: 1 }, { sparse: true });

module.exports = mongoose.model("User", userSchema);
