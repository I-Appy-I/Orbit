import { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { RxPerson, RxEyeOpen, RxEyeClosed } from "react-icons/rx";
import { MdOutlineAddAPhoto } from "react-icons/md";
import { FiMail, FiLock, FiUnlock } from "react-icons/fi";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { registerRoute } from "../../utils/APIRoutes";
import { toastOptions } from "../../utils/constants";
import { ChatState } from "../../context/ChatProvider";

function Register({ isLoginActive }) {
  const navigate = useNavigate();
  const { setUser } = ChatState();
  const [show, setShow] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isActive, setIsActive] = useState("not-active");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [values, setValues] = useState({
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
    profilePic: "",
  });

  const handleChange = (event) => {
    setValues({ ...values, [event.target.name]: event.target.value });
  };

  const imageUpload = (event) => {
    setValues({ ...values, profilePic: event.target.files[0] });
    setIsActive("active");
  };

  const handleValidation = () => {
    const { password, confirmPassword, username, email } = values;
    if (password !== confirmPassword) {
      toast.error("Password and confirm password should be same.", toastOptions);
      return false;
    } else if (username.trim().length < 4) {
      toast.error("Username should be at least 4 characters.", toastOptions);
      return false;
    } else if (password.length < 6) {
      toast.error("Password should be greater than 6 characters.", toastOptions);
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
        formData.append("username", username.trim());
        formData.append("email", email.trim().toLowerCase());
        formData.append("password", password);
        if (profilePic) {
          formData.append("profilePic", profilePic, profilePic.name);
        }

        const { data } = await axios.post(registerRoute, formData);

        if (data.status === false) {
          toast.error(data.msg, toastOptions);
        } else if (data.status === true) {
          localStorage.setItem(
            process.env.REACT_APP_LOCALHOST_KEY,
            JSON.stringify(data.user)
          );
          if (typeof setUser === "function") {
            setUser(data.user);
          }
          toast.success(data.msg || "Registration successful!", toastOptions);
          navigate("/", { replace: true });
        }
      } catch (error) {
        const fallbackMsg =
          error.message === "Network Error" || !error.response
            ? "Unable to connect to the server. Please check that the server is running."
            : "Registration failed";
        toast.error(error.response?.data?.msg || fallbackMsg, toastOptions);
      } finally {
        setIsSubmitting(false);
      }
    }
  };

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
                className={`${isActive === "active" ? "active" : ""}`}
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
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => isLoginActive("yes")}
                className="login-link"
              >
                Login Now
              </button>
            </span>
          </div>
        </form>
      </div>
      <ToastContainer />
    </>
  );
}

export default Register;
