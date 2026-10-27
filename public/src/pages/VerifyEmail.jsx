import React, { useEffect, useState, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

import {
  FiMail,
  FiCheckCircle,
  FiAlertCircle,
  FiClock,
  FiArrowRight,
  FiArrowLeft,
  FiRefreshCw,
} from "react-icons/fi";
import {
  verifyEmailRoute,
  resendVerificationRoute,
  verifyEmailUpdateRoute,
  resendEmailUpdateRoute,
  cancelEmailUpdateRoute,
} from "../utils/APIRoutes";
import { toastOptions } from "../utils/constants";
import { broadcastAuthEvent, subscribeToAuthEvents } from "../utils/authBroadcast";
import { ChatState } from "../context/ChatProvider";
import logo from "../assets/logo.svg";

function VerifyEmail() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const statusParam = searchParams.get("status");
  const emailParam = searchParams.get("email") || "";
  const mode = searchParams.get("mode");
  const isEmailChange = mode === "email-change";

  // Safely consume ChatState if available
  const chatContext = typeof ChatState === "function" ? ChatState() : undefined;
  const user = chatContext?.user;
  const setUser = chatContext?.setUser;

  const isLegacy = searchParams.get("legacy") === "true";

  // status: 'loading' | 'success' | 'expired' | 'invalid' | 'idle' | 'legacy'
  const [status, setStatus] = useState(() => {
    if (isLegacy) return "legacy";
    if (statusParam === "success") return "success";
    if (statusParam === "expired") return "expired";
    if (statusParam === "invalid") return "invalid";
    if (token) return "loading";
    return "idle";
  });

  const [message, setMessage] = useState("");
  const [resendEmail, setResendEmail] = useState(emailParam);
  const [isResending, setIsResending] = useState(false);
  const [resendSent, setResendSent] = useState(false);

  // Email change state: 6 distinct boxes
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const inputRefs = useRef([]);
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);
  const [changeError, setChangeError] = useState("");
  const [changeSuccess, setChangeSuccess] = useState(false);
  const [changeCooldown, setChangeCooldown] = useState(0);
  const [isResendingCode, setIsResendingCode] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  const fullCode = digits.join("");

  // Helper to obtain current auth token
  const getAuthToken = () => {
    if (user?.token) return user.token;
    try {
      const stored = JSON.parse(localStorage.getItem(process.env.REACT_APP_LOCALHOST_KEY));
      return stored?.token || null;
    } catch (e) {
      return null;
    }
  };

  useEffect(() => {
    if (token && status === "loading") {
      let isMounted = true;
      axios
        .post(verifyEmailRoute, { token })
        .then(({ data }) => {
          if (isMounted) {
            setStatus("success");
            setMessage(data.msg || "Email verified successfully. You can now log in.");
            broadcastAuthEvent({
              type: "ORBIT_EMAIL_VERIFIED",
              email: data.email || emailParam || null,
            });
          }
        })
        .catch((err) => {
          if (isMounted) {
            const errData = err.response?.data;
            if (errData?.error === "expired") {
              setStatus("expired");
              if (errData.email) setResendEmail(errData.email);
              setMessage(errData.msg || "Your verification link has expired.");
            } else {
              setStatus("invalid");
              setMessage(errData?.msg || "This verification link is invalid or has already been used.");
            }
          }
        });

      return () => {
        isMounted = false;
      };
    }
  }, [token, status, emailParam]);

  // When arriving via backend redirect (/verify-email?status=success)
  useEffect(() => {
    if (statusParam === "success") {
      broadcastAuthEvent({
        type: "ORBIT_EMAIL_VERIFIED",
        email: emailParam || null,
      });
    }
  }, [statusParam, emailParam]);

  // If another tab verifies while this tab is idle on /verify-email, navigate to login
  useEffect(() => {
    if (status === "idle" && !isEmailChange) {
      const unsubscribe = subscribeToAuthEvents((event) => {
        if (event.type === "ORBIT_EMAIL_VERIFIED") {
          navigate("/auth", { replace: true });
        }
      });
      return unsubscribe;
    }
  }, [status, isEmailChange, navigate]);

  // Cooldown countdown for email change resend
  useEffect(() => {
    if (changeCooldown <= 0) return;
    const interval = setInterval(() => {
      setChangeCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [changeCooldown]);

  const handleResend = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    const clean = resendEmail.trim().toLowerCase();
    if (!clean) {
      toast.error("Please enter your email address", toastOptions);
      return;
    }

    try {
      setIsResending(true);
      const { data } = await axios.post(resendVerificationRoute, { email: clean });
      setResendSent(true);
      toast.success(data.msg || "Verification link sent! Please check your inbox.", toastOptions);
    } catch (err) {
      const errMsg = err.response?.data?.msg || "Failed to resend verification link.";
      toast.error(errMsg, toastOptions);
    } finally {
      setIsResending(false);
    }
  };

  const handleDigitChange = (index, e) => {
    const val = e.target.value;
    const digitsOnly = val.replace(/\D/g, "");

    // User pasted multiple digits into one box
    if (digitsOnly.length > 1) {
      const nextDigits = [...digits];
      const chars = digitsOnly.slice(0, 6).split("");
      chars.forEach((char, i) => {
        if (index + i < 6) {
          nextDigits[index + i] = char;
        }
      });
      setDigits(nextDigits);
      setChangeError("");
      const nextFocus = Math.min(index + chars.length, 5);
      inputRefs.current[nextFocus]?.focus();
      return;
    }

    const nextDigits = [...digits];
    nextDigits[index] = digitsOnly;
    setDigits(nextDigits);
    setChangeError("");

    if (digitsOnly && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === "Backspace") {
      if (!digits[index] && index > 0) {
        e.preventDefault();
        const nextDigits = [...digits];
        nextDigits[index - 1] = "";
        setDigits(nextDigits);
        inputRefs.current[index - 1]?.focus();
      } else {
        const nextDigits = [...digits];
        nextDigits[index] = "";
        setDigits(nextDigits);
      }
    } else if (e.key === "ArrowLeft" && index > 0) {
      e.preventDefault();
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < 5) {
      e.preventDefault();
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;

    const nextDigits = ["", "", "", "", "", ""];
    pasted.split("").forEach((c, i) => {
      nextDigits[i] = c;
    });
    setDigits(nextDigits);
    setChangeError("");
    const focusIndex = Math.min(pasted.length, 5);
    inputRefs.current[focusIndex]?.focus();
  };

  const handleVerifyEmailChange = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    if (fullCode.length !== 6) {
      setChangeError("Please enter the complete 6-digit verification code");
      toast.error("Please enter the complete 6-digit verification code", toastOptions);
      return;
    }

    try {
      setIsVerifyingCode(true);
      setChangeError("");
      const authToken = getAuthToken();
      const config = authToken ? { headers: { Authorization: `Bearer ${authToken}` } } : {};

      const { data } = await axios.post(
        verifyEmailUpdateRoute,
        { code: fullCode },
        config
      );

      if (data.status) {
        const updated = data.user || data.updatedUser;
        if (updated) {
          localStorage.setItem(
            process.env.REACT_APP_LOCALHOST_KEY,
            JSON.stringify(updated)
          );
          if (typeof setUser === "function") {
            setUser(updated);
          }
        }
        setChangeSuccess(true);
        setTimeout(() => {
          navigate("/?openProfile=true", {
            replace: true,
            state: {
              openProfileSettings: true,
              emailUpdatedMessage: data.msg || "Email updated successfully!",
            },
          });
        }, 1200);
      } else {
        setChangeError(data.msg || "Verification failed");
        toast.error(data.msg || "Verification failed", toastOptions);
      }
    } catch (err) {
      const errMsg =
        err.response?.data?.msg ||
        err.response?.data?.message ||
        "Verification failed. Please check your code.";
      setChangeError(errMsg);
      toast.error(errMsg, toastOptions);
    } finally {
      setIsVerifyingCode(false);
    }
  };

  const handleResendEmailChange = async () => {
    if (changeCooldown > 0 || isResendingCode || isCancelling) return;
    try {
      setIsResendingCode(true);
      setChangeError("");
      const authToken = getAuthToken();
      const config = authToken ? { headers: { Authorization: `Bearer ${authToken}` } } : {};
      const { data } = await axios.post(resendEmailUpdateRoute, {}, config);
      if (data.status) {
        setChangeCooldown(60);
        setDigits(["", "", "", "", "", ""]);
        inputRefs.current[0]?.focus();
        toast.success(data.msg || "A new 6-digit verification code has been sent!", toastOptions);
      } else {
        toast.error(data.msg || "Failed to resend verification code", toastOptions);
      }
    } catch (err) {
      const retryAfter = err.response?.data?.retryAfter;
      if (retryAfter) setChangeCooldown(retryAfter);
      const errMsg =
        err.response?.data?.msg ||
        err.response?.data?.message ||
        "Failed to resend verification code";
      toast.error(errMsg, toastOptions);
    } finally {
      setIsResendingCode(false);
    }
  };

  const handleCancelEmailChange = async () => {
    if (isCancelling) return;
    try {
      setIsCancelling(true);
      const authToken = getAuthToken();
      const config = authToken ? { headers: { Authorization: `Bearer ${authToken}` } } : {};
      await axios.post(cancelEmailUpdateRoute, {}, config);
    } catch (err) {
      // Silently continue to navigate on cancel so user is never locked
    } finally {
      setIsCancelling(false);
      navigate("/?openProfile=true", {
        replace: true,
        state: { openProfileSettings: true },
      });
    }
  };

  return (
    <div className="auth">
      <div className="auth-wrapper">
        <div className="auth-brand">
          <img src={logo} alt="Orbit Logo" className="auth-brand-logo" />
          <span className="auth-brand-name">Orbit</span>
        </div>

        <div className="form-container verification-card">
          {isEmailChange ? (
            changeSuccess ? (
              <div className="verification-state state-success">
                <div className="state-icon-wrapper icon-success">
                  <FiCheckCircle className="state-icon" />
                </div>
                <h1 className="title">Email updated!</h1>
                <p className="subtitle">
                  Your email address has been successfully verified and updated.
                </p>
                <button
                  type="button"
                  className="btn-verify-primary"
                  onClick={() =>
                    navigate("/?openProfile=true", {
                      replace: true,
                      state: { openProfileSettings: true },
                    })
                  }
                >
                  Return to Profile <FiArrowRight style={{ marginLeft: 8 }} />
                </button>
              </div>
            ) : (
              <div className="verification-state state-idle">
                <div className="state-icon-wrapper icon-pulse">
                  <FiMail className="state-icon" />
                </div>
                <h1 className="title">Verify Your New Email</h1>
                <p className="subtitle">
                  A 6-digit verification code was sent to:
                </p>
                <div className="target-email-badge">
                  <FiMail className="badge-icon" />
                  <span>{emailParam || "your new email address"}</span>
                </div>

                {changeError && (
                  <div className="alert-box danger" role="alert" style={{ marginBottom: "1rem" }}>
                    {changeError}
                  </div>
                )}

                <form onSubmit={handleVerifyEmailChange} className="otp-form-wrapper">
                  <div className="otp-input-group" onPaste={handlePaste}>
                    {digits.map((digit, idx) => (
                      <input
                        key={idx}
                        ref={(el) => (inputRefs.current[idx] = el)}
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={1}
                        value={digit}
                        onChange={(e) => handleDigitChange(idx, e)}
                        onKeyDown={(e) => handleKeyDown(idx, e)}
                        onFocus={(e) => e.target.select()}
                        disabled={isVerifyingCode || isCancelling}
                        className={`otp-box ${digit ? "filled" : ""}`}
                        aria-label={`Digit ${idx + 1}`}
                        data-testid={`otp-digit-${idx}`}
                        autoFocus={idx === 0}
                        autoComplete="one-time-code"
                      />
                    ))}
                  </div>

                  <button
                    type="submit"
                    className="btn-verify-primary"
                    disabled={fullCode.length !== 6 || isVerifyingCode || isCancelling}
                  >
                    {isVerifyingCode ? "Verifying..." : "Verify Code"}
                  </button>
                </form>

                <div className="resend-action-wrapper">
                  <button
                    type="button"
                    className="btn-resend-secondary"
                    onClick={handleResendEmailChange}
                    disabled={changeCooldown > 0 || isResendingCode || isVerifyingCode || isCancelling}
                  >
                    <FiRefreshCw className={isResendingCode ? "icon-spin" : ""} style={{ fontSize: "0.85rem" }} />
                    {isResendingCode ? (
                      "Sending..."
                    ) : changeCooldown > 0 ? (
                      <>
                        Resend code in <span className="cooldown-text">{changeCooldown}s</span>
                      </>
                    ) : (
                      "Resend Code"
                    )}
                  </button>
                </div>

                <div className="cancel-action-wrapper">
                  <button
                    type="button"
                    onClick={handleCancelEmailChange}
                    className="btn-cancel-return"
                    disabled={isCancelling || isVerifyingCode}
                  >
                    <FiArrowLeft style={{ fontSize: "0.9rem" }} />
                    {isCancelling ? "Cancelling..." : "Cancel & Return to Profile"}
                  </button>
                </div>
              </div>
            )
          ) : (
            <>
              {status === "loading" && (
                <div className="verification-state state-loading">
                  <div className="state-icon-wrapper icon-pulse">
                    <FiMail className="state-icon" />
                  </div>
                  <h1 className="title">Verifying email</h1>
                  <p className="subtitle">Please wait while we verify your Orbit account...</p>
                </div>
              )}

              {status === "success" && (
                <div className="verification-state state-success">
                  <div className="state-icon-wrapper icon-success">
                    <FiCheckCircle className="state-icon" />
                  </div>
                  <h1 className="title">Email verified!</h1>
                  <p className="subtitle">
                    {message || "Email verified successfully. You can now log in."}
                  </p>
                  <button
                    type="button"
                    className="input-field button"
                    onClick={() => navigate("/auth", { replace: true })}
                  >
                    Proceed to Log In <FiArrowRight style={{ marginLeft: 8 }} />
                  </button>
                </div>
              )}

              {status === "expired" && (
                <div className="verification-state state-expired">
                  <div className="state-icon-wrapper icon-warning">
                    <FiClock className="state-icon" />
                  </div>
                  <h1 className="title">Verification link expired</h1>
                  <p className="subtitle">
                    {message || "This verification link has expired. Links are valid for 24 hours."}
                  </p>

                  {resendSent ? (
                    <div className="alert-box success">
                      A fresh verification link has been sent to <strong>{resendEmail}</strong>. Please check your inbox.
                    </div>
                  ) : (
                    <form onSubmit={handleResend} className="resend-form">
                      <div className="input-field">
                        <input
                          type="email"
                          placeholder="Enter your email"
                          value={resendEmail}
                          onChange={(e) => setResendEmail(e.target.value)}
                          required
                        />
                        <FiMail />
                      </div>
                      <button
                        type="submit"
                        className="input-field button"
                        disabled={isResending}
                      >
                        {isResending ? "Sending..." : "Resend Verification Link"}
                      </button>
                    </form>
                  )}

                  <div className="login-signup">
                    <span className="text">
                      Already verified?{" "}
                      <button
                        type="button"
                        onClick={() => navigate("/auth")}
                        className="login-link"
                      >
                        Log In
                      </button>
                    </span>
                  </div>
                </div>
              )}

              {status === "invalid" && (
                <div className="verification-state state-invalid">
                  <div className="state-icon-wrapper icon-danger">
                    <FiAlertCircle className="state-icon" />
                  </div>
                  <h1 className="title">Invalid verification link</h1>
                  <p className="subtitle">
                    {message || "This verification link is invalid, expired, or has already been used."}
                  </p>

                  {resendSent ? (
                    <div className="alert-box success">
                      If an unverified account exists for <strong>{resendEmail}</strong>, a new link has been sent.
                    </div>
                  ) : (
                    <form onSubmit={handleResend} className="resend-form">
                      <p className="resend-hint">Need a new verification link? Enter your email:</p>
                      <div className="input-field">
                        <input
                          type="email"
                          placeholder="Enter your email"
                          value={resendEmail}
                          onChange={(e) => setResendEmail(e.target.value)}
                          required
                        />
                        <FiMail />
                      </div>
                      <button
                        type="submit"
                        className="input-field button"
                        disabled={isResending}
                      >
                        {isResending ? "Sending..." : "Request New Verification Link"}
                      </button>
                    </form>
                  )}

                  <div className="login-signup">
                    <span className="text">
                      Return to{" "}
                      <button
                        type="button"
                        onClick={() => navigate("/auth")}
                        className="login-link"
                      >
                        Log In
                      </button>
                    </span>
                  </div>
                </div>
              )}

              {status === "legacy" && (
                <div className="verification-state state-idle">
                  <div className="state-icon-wrapper icon-pulse">
                    <FiMail className="state-icon" />
                  </div>
                  <h1 className="title">Verification Code Required</h1>
                  <p className="subtitle">
                    Orbit now uses secure 6-digit verification codes sent directly to your email. Please return to sign in to enter your code or request a fresh one.
                  </p>
                  <button
                    type="button"
                    className="input-field button"
                    onClick={() => navigate("/auth", { replace: true })}
                  >
                    Go to Sign In <FiArrowRight style={{ marginLeft: 8 }} />
                  </button>
                </div>
              )}

              {status === "idle" && (
                <div className="verification-state state-idle">
                  <div className="state-icon-wrapper icon-pulse">
                    <FiMail className="state-icon" />
                  </div>
                  <h1 className="title">Email verification</h1>
                  <p className="subtitle">
                    Please check your inbox and click the verification link sent to your email address.
                  </p>

                  {resendSent ? (
                    <div className="alert-box success">
                      If an unverified account exists for <strong>{resendEmail}</strong>, a new link has been sent.
                    </div>
                  ) : (
                    <form onSubmit={handleResend} className="resend-form">
                      <p className="resend-hint">Didn't receive an email? Request a new link:</p>
                      <div className="input-field">
                        <input
                          type="email"
                          placeholder="Enter your email"
                          value={resendEmail}
                          onChange={(e) => setResendEmail(e.target.value)}
                          required
                        />
                        <FiMail />
                      </div>
                      <button
                        type="submit"
                        className="input-field button"
                        disabled={isResending}
                      >
                        {isResending ? "Sending..." : "Resend Verification Link"}
                      </button>
                    </form>
                  )}

                  <div className="login-signup">
                    <span className="text">
                      <button
                        type="button"
                        onClick={() => navigate("/auth")}
                        className="login-link"
                      >
                        Back to Log In
                      </button>
                    </span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      <ToastContainer />
    </div>
  );
}

export default VerifyEmail;
