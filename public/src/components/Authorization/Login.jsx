import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "react-toastify/dist/ReactToastify.css";
import { ToastContainer, toast } from "react-toastify";

import { RxPerson, RxEyeOpen, RxEyeClosed } from "react-icons/rx";
import { FiLock, FiAlertCircle } from "react-icons/fi";
import axios from "axios";
import { loginRoute, resendVerificationRoute, verifyCodeRoute } from "../../utils/APIRoutes";
import { toastOptions } from "../../utils/constants";
import { ChatState } from "../../context/ChatProvider";
import { subscribeToAuthEvents } from "../../utils/authBroadcast";

function Login({ isActive }) {
  const navigate = useNavigate();
  const { setUser } = ChatState();
  const [values, setValues] = useState({ username: "", password: "" });
  const [show, setShow] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [unverifiedUser, setUnverifiedUser] = useState(null);
  const [isResending, setIsResending] = useState(false);
  const [verifyCode, setVerifyCode] = useState("");
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    let timer;
    if (resendCooldown > 0) {
      timer = setInterval(() => {
        setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [resendCooldown]);

  useEffect(() => {
    const unsubscribe = subscribeToAuthEvents((event) => {
      if (event.type === "ORBIT_EMAIL_VERIFIED") {
        setUnverifiedUser(null);
        setVerifyCode("");
        toast.success("Email verified successfully! You can now log in.", toastOptions);
      }
    });

    return unsubscribe;
  }, []);

  // setting values of inputs
  const handleChange = (event) => {
    setValues({ ...values, [event.target.name]: event.target.value });
    if (unverifiedUser) {
      setUnverifiedUser(null);
    }
  };

  // checking if the entered data exists in the database
  const validateForm = () => {
    const { username, password } = values;
    if (username === "") {
      toast.error("Username or Password is incorrect", toastOptions);
      return false;
    } else if (password === "") {
      toast.error("Username or Password is incorrect", toastOptions);
      return false;
    }
    return true;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (validateForm()) {
      try {
        setIsSubmitting(true);
        const config = {
          headers: {
            "Content-type": "application/json",
          },
        };
        const { username, password } = values;
        const { data } = await axios.post(loginRoute, {
          username,
          password,
        }, config);

        if (data.status === false) {
          toast.error(data.msg, toastOptions);
        }
        if (data.status === true) {
          localStorage.setItem(
            process.env.REACT_APP_LOCALHOST_KEY,
            JSON.stringify(data)
          );
          setUser(data);
          navigate("/", { replace: true });
        }
      } catch (error) {
        const errorData = error.response?.data;
        if (errorData?.emailVerified === false) {
          setUnverifiedUser({
            email: errorData.email,
            username: values.username,
          });
          toast.error(errorData.msg || "Please verify your email address before logging in.", toastOptions);
        } else {
          toast.error(errorData?.msg || "Login failed", toastOptions);
        }
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const handleResend = async () => {
    const emailTarget = unverifiedUser?.email;
    if (!emailTarget || resendCooldown > 0) return;

    try {
      setIsResending(true);
      const { data } = await axios.post(resendVerificationRoute, { email: emailTarget });
      setResendCooldown(60);
      setVerifyCode("");
      toast.success(data.msg || "A new 6-digit verification code has been sent!", toastOptions);
    } catch (err) {
      const retryAfter = err.response?.data?.retryAfter;
      if (retryAfter) setResendCooldown(retryAfter);
      toast.error(err.response?.data?.msg || "Failed to resend verification code", toastOptions);
    } finally {
      setIsResending(false);
    }
  };

  const handleVerifyCode = async () => {
    const emailTarget = unverifiedUser?.email;
    if (!emailTarget || verifyCode.length !== 6) return;

    try {
      setIsVerifyingCode(true);
      const { data } = await axios.post(verifyCodeRoute, {
        email: emailTarget,
        code: verifyCode,
      });

      if (data.status) {
        toast.success(data.msg || "Email verified successfully! You can now log in.", toastOptions);
        setUnverifiedUser(null);
        setVerifyCode("");
      } else {
        toast.error(data.msg || "Verification failed", toastOptions);
      }
    } catch (err) {
      toast.error(err.response?.data?.msg || "Verification failed. Please check your code.", toastOptions);
    } finally {
      setIsVerifyingCode(false);
    }
  };

  return (
    <>
      <div className="login-wrapper form-container">
        <form className="form login" action="" onSubmit={(event) => handleSubmit(event)}>
          <h1 className="title">Welcome back</h1>
          <p className="subtitle">Sign in to continue chatting</p>

          {unverifiedUser && (
            <div className="alert-box warning unverified-notice">
              <div className="alert-content">
                <FiAlertCircle className="alert-icon" />
                <div>
                  <strong>Email verification required</strong>
                  <p>
                    Please enter the 6-digit verification code sent to{" "}
                    <strong>{unverifiedUser.email}</strong>.
                  </p>
                </div>
              </div>

              <div className="unverified-code-row">
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength="6"
                  placeholder="6-digit code"
                  value={verifyCode}
                  onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  className="unverified-code-input"
                />
                <button
                  type="button"
                  className="verify-inline-btn"
                  onClick={handleVerifyCode}
                  disabled={verifyCode.length !== 6 || isVerifyingCode}
                >
                  {isVerifyingCode ? "Verifying..." : "Verify Code"}
                </button>
              </div>

              {resendCooldown > 0 ? (
                <p className="resend-countdown-sm">
                  Resend code in <strong>{resendCooldown}s</strong>
                </p>
              ) : (
                <button
                  type="button"
                  className="resend-inline-btn"
                  onClick={handleResend}
                  disabled={isResending}
                >
                  {isResending ? "Sending..." : "Resend 6-digit code"}
                </button>
              )}
            </div>
          )}

          <div className="inputs">
            <div className="input-field">
              <input
                id="login-username"
                type="text"
                placeholder="Username"
                name="username"
                autoComplete="username"
                onChange={(e) => handleChange(e)}
                min="3"
              />
              <RxPerson />
            </div>
            <div className="input-field">
              <input
                id="login-password"
                type={`${show ? "text" : "password"}`}
                placeholder="Password"
                name="password"
                autoComplete="current-password"
                onChange={(e) => handleChange(e)}
              />
              <FiLock />
              <RxEyeOpen
                className={`${show ? "password-icon" : "none"}`}
                onClick={() => { setShow(false); }}
              />
              <RxEyeClosed
                className={`${!show ? "password-icon" : "none"}`}
                onClick={() => { setShow(true); }}
              />
            </div>
          </div>
          <div>
            <button
              id="login-submit"
              type="submit"
              className="input-field button"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Logging in..." : "Log In"}
            </button>
          </div>
          <div className="login-signup">
            <span className="text">
              Don't have an account? <button type="button" onClick={() => isActive('no')} className="login-link">Create One</button>
            </span>
          </div>
        </form>
      </div>
      <ToastContainer />
    </>
  );
}

export default Login;
