/**
 * In-memory sliding-window rate limiter for sensitive authentication endpoints
 * (registration, login, verify code, and resend verification) to protect against brute-force attacks and abuse.
 */

const hitRecords = new Map();

/**
 * Creates an Express rate-limiting middleware.
 * @param {Object} options
 * @param {number} options.windowMs - Time window in milliseconds
 * @param {number} options.max - Maximum number of requests allowed in window
 * @param {string} options.message - Error message returned on breach
 * @param {Function} [options.keyGenerator] - Custom key generator (default: IP address)
 */
function createRateLimiter({
  windowMs = 15 * 60 * 1000,
  max = 10,
  message = "Too many requests. Please try again later.",
  keyGenerator = (req) => req.ip || req.connection?.remoteAddress || "unknown",
}) {
  return (req, res, next) => {
    // Skip rate-limiting in test mode unless specifically enabled
    if (process.env.NODE_ENV === "test" && !process.env.ENABLE_TEST_RATE_LIMIT) {
      return next();
    }

    const key = `${req.baseUrl || ""}${req.path}:${keyGenerator(req)}`;
    const now = Date.now();
    const windowStart = now - windowMs;

    const timestamps = hitRecords.get(key) || [];
    const validTimestamps = timestamps.filter((time) => time > windowStart);

    if (validTimestamps.length >= max) {
      const retryAfterSeconds = Math.ceil((validTimestamps[0] + windowMs - now) / 1000);
      res.setHeader("Retry-After", Math.max(1, retryAfterSeconds));
      return res.status(429).json({
        status: false,
        msg: message,
        retryAfter: retryAfterSeconds,
      });
    }

    validTimestamps.push(now);
    hitRecords.set(key, validTimestamps);
    return next();
  };
}

function clearRateLimitRecords() {
  hitRecords.clear();
}

// 10 registrations per IP per 15 minutes
const registerRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "Too many registration attempts from this address. Please try again later.",
});

// 15 login attempts per IP/account per 15 minutes
const loginRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: "Too many login attempts. Please try again after 15 minutes.",
  keyGenerator: (req) => {
    const ip = req.ip || req.connection?.remoteAddress || "ip";
    const username = (req.body?.username || "").trim().toLowerCase();
    return `${ip}:${username}`;
  },
});

// 10 verification attempts per IP/target per 15 minutes
const verifyCodeRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "Too many verification attempts. Please try again later.",
  keyGenerator: (req) => {
    const ip = req.ip || req.connection?.remoteAddress || "ip";
    const email = (req.body?.email || req.query?.email || "").trim().toLowerCase();
    return `${ip}:${email}`;
  },
});

// 3 resend attempts per IP/target per 5 minutes
const resendRateLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000,
  max: 3,
  message: "Too many verification requests. Please wait a few minutes before trying again.",
  keyGenerator: (req) => {
    const ip = req.ip || req.connection?.remoteAddress || "ip";
    const email = (req.body?.email || "").trim().toLowerCase();
    return `${ip}:${email}`;
  },
});

module.exports = {
  createRateLimiter,
  registerRateLimiter,
  loginRateLimiter,
  verifyCodeRateLimiter,
  resendRateLimiter,
  clearRateLimitRecords,
};
