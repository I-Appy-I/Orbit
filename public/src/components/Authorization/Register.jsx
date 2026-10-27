import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { RxPerson, RxEyeOpen, RxEyeClosed } from "react-icons/rx";
import { MdOutlineAddAPhoto } from "react-icons/md";
import { FiMail, FiLock, FiUnlock, FiAlertCircle } from "react-icons/fi";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { registerRoute, resendVerificationRoute, verifyCodeRoute } from "../../utils/APIRoutes";
import { toastOptions } from "../../utils/constants";
import { subscribeToAuthEvents } from "../../utils/authBroadcast";

function Register({ isLoginActive }) {
  const navigate = useNavigate();
  const [show, setShow] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isActive, setIsActive] = useState('not-active');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [registeredUser, setRegisteredUser] = useState(null);
  const [isResending, setIsResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState("");
  const [resendCooldown, setResendCooldown] = useState(60);

  // Countdown timer for code resend
  useEffect(() => {
    let timer;
    if (registeredUser && resendCooldown > 0) {
      timer = setInterval(() => {
        setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [registeredUser, resendCooldown]);

  // Listen for verification success from another tab (if applicable)
  useEffect(() => {
    if (!registeredUser) return;

    const unsubscribe = subscribeToAuthEvents((event) => {
      if (event.type === "ORBIT_EMAIL_VERIFIED") {
        setRegisteredUser(null);
        setVerificationCode("");
        if (typeof isLoginActive === "function") {
          isLoginActive("yes");
        }
        navigate("/auth", { replace: true });
        toast.success("Email verified successfully! You can now log in.", toastOptions);
      }
    });

    return unsubscribe;
  }, [registeredUser, isLoginActive, navigate]);

  // creating useState hook and setting empty values into it
  const [values, setValues] = useState({
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
    profilePic: "",
  });

  // setting values of inputs
  const handleChange = (event) => {
    setValues({ ...values, [event.target.name]: event.target.value });
  };

  // setting an image value
  const imageUpload = (event) => {
    setValues({ ...values, profilePic: event.target.files[0] });
    setIsActive('active');
  };

  const handleValidation = () => {
    const { password, confirmPassword, username, email } = values;
    if (password !== confirmPassword) {
      toast.error(
        "Password and confirm password should be same.",
        toastOptions
      );
      return false;
    } else if (username.length < 3) {
      toast.error(
        "Username should be greater than 3 characters.",
        toastOptions
      );
      return false;
    } else if (password.length < 6) {
      toast.error(
        "Password should be greater than 6 characters.",
        toastOptions
      );
      return false;
    } else if (email === "") {
      toast.error("Email is required.", toastOptions);
      return false;
    }
    return true;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (handleValidation()) {
      try {
        setIsSubmitting(true);
        const { username, email, password, profilePic } = values;
        const formData = new FormData();
        formData.append("username", username);
        formData.append("email", email);
        formData.append("password", password);
        if (profilePic) {
          formData.append("profilePic", profilePic, profilePic.name);
        }
        const { data } = await axios.post(registerRoute, formData);
        if (data.status === false) {
          toast.error(data.msg, toastOptions);
        } else if (data.status === true) {
          setRegisteredUser({
            email: data.email || email,
            emailDeliveryFailed: Boolean(data.emailDeliveryFailed),
            msg: data.msg,
          });
          setResendCooldown(60);
          setVerificationCode("");
          setVerifyError("");
          if (data.emailDeliveryFailed) {
            toast.warn(data.msg, toastOptions);
          } else {
            toast.success(data.msg || "Verification code sent to your email!", toastOptions);
          }
        }
      } catch (error) {
        const fallbackMsg = error.message === "Network Error" || !error.response
          ? "Unable to connect to the server. Please check that the server is running."
          : "Registration failed";
        toast.error(error.response?.data?.msg || fallbackMsg, toastOptions);
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const handleCodeChange = (e) => {
    const val = e.target.value.replace(/\D/g, "").slice(0, 6);
    setVerificationCode(val);
    setVerifyError("");
  };

  const handleVerifyCode = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    if (!registeredUser?.email) return;

    if (verificationCode.length !== 6) {
      setVerifyError("Please enter the complete 6-digit verification code");
      return;
    }

    try {
      setIsVerifying(true);
      setVerifyError("");
      const { data } = await axios.post(verifyCodeRoute, {
        email: registeredUser.email,
        code: verificationCode,
      });

      if (data.status) {
        toast.success(data.msg || "Email verified successfully! You can now log in.", toastOptions);
        setRegisteredUser(null);
        setVerificationCode("");
        if (typeof isLoginActive === "function") {
          isLoginActive("yes");
        }
        navigate("/auth", { replace: true });
      } else {
        setVerifyError(data.msg || "Verification failed");
      }
    } catch (err) {
      const errMsg = err.response?.data?.msg || "Verification failed. Please check your code.";
      setVerifyError(errMsg);
      toast.error(errMsg, toastOptions);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResendVerification = async () => {
    if (!registeredUser?.email || resendCooldown > 0) return;
    try {
      setIsResending(true);
      setVerifyError("");
      const { data } = await axios.post(resendVerificationRoute, {
        email: registeredUser.email,
      });
      setResendSuccess(true);
      setResendCooldown(60);
      setVerificationCode("");
      toast.success(data.msg || "A new 6-digit verification code has been sent!", toastOptions);
    } catch (err) {
      const retryAfter = err.response?.data?.retryAfter;
      if (retryAfter) setResendCooldown(retryAfter);
      toast.error(err.response?.data?.msg || "Failed to resend verification code", toastOptions);
    } finally {
      setIsResending(false);
    }
  };

  if (registeredUser) {
    const isDeliveryFailed = Boolean(registeredUser.emailDeliveryFailed) && !resendSuccess;

    return (
      <>
        <div className="resiter-wrapper form-container verification-card">
          <div className="verification-state state-pending">
            <div className={`state-icon-wrapper ${isDeliveryFailed ? "icon-warning" : "icon-pulse"}`}>
              {isDeliveryFailed ? (
                <FiAlertCircle className="state-icon" />
              ) : (
                <FiMail className="state-icon" />
              )}
            </div>
            <h1 className="title">
              {isDeliveryFailed ? "Delivery Issue" : "Enter Verification Code"}
            </h1>
            <p className="subtitle">
              {isDeliveryFailed ? (
                <>
                  We could not automatically deliver the code to{" "}
                  <strong>{registeredUser.email}</strong>
                </>
              ) : (
                <>
                  We've sent a 6-digit verification code to{" "}
                  <strong>{registeredUser.email}</strong>
                </>
              )}
            </p>
            <p className="description">
              {isDeliveryFailed
                ? "Your Orbit account was created, but delivering the email via Gmail SMTP failed. Please verify server SMTP settings or click below to retry."
                : "Enter the 6-digit code below to activate your account. Codes are valid for 10 minutes."}
            </p>

            {isDeliveryFailed && (
              <div className="alert-box warning">
                Automatic delivery could not be completed. Click below to retry sending the verification code.
              </div>
            )}

            {verifyError && (
              <div className="alert-box danger" role="alert">
                {verifyError}
              </div>
            )}

            {resendSuccess && (
              <div className="alert-box success">
                A fresh 6-digit verification code has been sent to your email!
              </div>
            )}

            <form onSubmit={handleVerifyCode} className="verification-code-form">
              <div className="input-field code-input-field">
                <input
                  id="reg-verify-code"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength="6"
                  placeholder="000000"
                  value={verificationCode}
                  onChange={handleCodeChange}
                  autoFocus
                  autoComplete="one-time-code"
                  className="code-input"
                  disabled={isVerifying}
                />
              </div>

              <button
                type="submit"
                className="input-field button"
                disabled={verificationCode.length !== 6 || isVerifying}
              >
                {isVerifying ? "Verifying..." : "Verify Code"}
              </button>
            </form>

            <div className="resend-section">
              {resendCooldown > 0 ? (
                <p className="resend-countdown">
                  Resend code in <strong>{resendCooldown}s</strong>
                </p>
              ) : (
                <button
                  type="button"
                  className="resend-link-btn"
                  disabled={isResending}
                  onClick={handleResendVerification}
                >
                  {isResending ? "Sending..." : "Didn't receive the code? Resend Code"}
                </button>
              )}
            </div>

            <div className="login-signup">
              <span className="text">
                Already verified?{" "}
                <button
                  type="button"
                  onClick={() => isLoginActive("yes")}
                  className="login-link"
                >
                  Log In
                </button>
              </span>
            </div>
          </div>
        </div>
        <ToastContainer />
      </>
    );
  }

  return (
    <>
      <div className="resiter-wrapper form-container">
        <form className="form signup" onSubmit={(event) => handleSubmit(event)}>
          <h1 className="title">Create account</h1>
          <p className="subtitle">Join and start chatting today</p>
          <div className="inputs">
            <div className="input-field">
              <input
                id="reg-username"
                type="text"
                placeholder="Enter your name"
                name="username"
                autoComplete="username"
                onChange={(e) => handleChange(e)}
              />
              <RxPerson />
            </div>
            <div className="input-field">
              <input
                id="reg-email"
                type="email"
                placeholder="Enter your email"
                name="email"
                autoComplete="email"
                onChange={(e) => handleChange(e)}
              />
              <FiMail />
            </div>
            <div className="input-field">
              <input
                id="reg-password"
                type={`${show ? "text" : "password"}`}
                placeholder="Password"
                name="password"
                autoComplete="new-password"
                onChange={(e) => handleChange(e)}
              />
              <FiUnlock />
              <RxEyeOpen
                className={`${show ? "password-icon" : "none"}`}
                onClick={() => { setShow(false); }}
              />
              <RxEyeClosed
                className={`${!show ? "password-icon" : "none"}`}
                onClick={() => { setShow(true); }}
              />
            </div>
            <div className="input-field">
              <input
                id="reg-confirm-password"
                type={`${showConfirm ? "text" : "password"}`}
                placeholder="Confirm Password"
                name="confirmPassword"
                autoComplete="new-password"
                onChange={(e) => handleChange(e)}
              />
              <FiLock />
              <RxEyeOpen
                className={`${showConfirm ? "password-icon" : "none"}`}
                onClick={() => { setShowConfirm(false); }}
              />
              <RxEyeClosed
                className={`${showConfirm ? "none" : "password-icon"}`}
                onClick={() => { setShowConfirm(true); }}
              />
            </div>
            <div className="input-field ">
              <input
                id="reg-profile-pic"
                type="file"
                name="profilePic"
                accept="image/*"
                className={`${isActive === 'active' ? 'active' : ''}`}
                onChange={(e) => imageUpload(e)}
              />
              <MdOutlineAddAPhoto />
            </div>
          </div>
          <div>
            <button
              id="reg-submit"
              type="submit"
              className="input-field button"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Creating..." : "Create User"}
            </button>
          </div>
          <div className="login-signup">
            <span className="text">
              Already have an account? <button type="button" onClick={() => isLoginActive('yes')} className="login-link">Login Now</button>
            </span>
          </div>
        </form>
      </div>
      <ToastContainer />
    </>
  );
}

export default Register;
