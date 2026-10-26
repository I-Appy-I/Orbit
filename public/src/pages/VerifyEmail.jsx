import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

import { FiMail, FiCheckCircle, FiAlertCircle, FiClock, FiArrowRight } from "react-icons/fi";
import { verifyEmailRoute, resendVerificationRoute } from "../utils/APIRoutes";
import { toastOptions } from "../utils/constants";
import { broadcastAuthEvent, subscribeToAuthEvents } from "../utils/authBroadcast";
import logo from "../assets/logo.svg";

function VerifyEmail() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const statusParam = searchParams.get("status");
  const emailParam = searchParams.get("email") || "";

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
    if (status === "idle") {
      const unsubscribe = subscribeToAuthEvents((event) => {
        if (event.type === "ORBIT_EMAIL_VERIFIED") {
          navigate("/auth", { replace: true });
        }
      });
      return unsubscribe;
    }
  }, [status, navigate]);

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

  return (
    <div className="auth">
      <div className="auth-wrapper">
        <div className="auth-brand">
          <img src={logo} alt="Orbit Logo" className="auth-brand-logo" />
          <span className="auth-brand-name">Orbit</span>
        </div>

        <div className="form-container verification-card">
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
        </div>
      </div>
      <ToastContainer />
    </div>
  );
}

export default VerifyEmail;
