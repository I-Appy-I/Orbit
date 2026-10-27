import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "react-toastify/dist/ReactToastify.css";
import { ToastContainer, toast } from "react-toastify";

import { RxPerson, RxEyeOpen, RxEyeClosed } from "react-icons/rx";
import { FiLock } from "react-icons/fi";
import axios from "axios";
import { loginRoute } from "../../utils/APIRoutes";
import { toastOptions } from "../../utils/constants";
import { ChatState } from "../../context/ChatProvider";

function Login({ isActive }) {
  const navigate = useNavigate();
  const { setUser } = ChatState();
  const [values, setValues] = useState({ username: "", password: "" });
  const [show, setShow] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // setting values of inputs
  const handleChange = (event) => {
    setValues({ ...values, [event.target.name]: event.target.value });
  };

  // checking if the entered data exists in the database
  const validateForm = () => {
    const { username, password } = values;
    if (username === "" || password === "") {
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
        const { data } = await axios.post(
          loginRoute,
          {
            username: username.trim(),
            password,
          },
          config
        );

        if (data.status === false) {
          toast.error(data.msg, toastOptions);
        }
        if (data.status === true) {
          localStorage.setItem(
            process.env.REACT_APP_LOCALHOST_KEY,
            JSON.stringify(data)
          );
          if (typeof setUser === "function") {
            setUser(data);
          }
          navigate("/", { replace: true });
        }
      } catch (error) {
        const errorData = error.response?.data;
        const fallbackMsg =
          error.message === "Network Error" || !error.response
            ? "Unable to connect to the server. Please check that the server is running."
            : "Login failed";
        toast.error(errorData?.msg || fallbackMsg, toastOptions);
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  return (
    <>
      <div className="login-wrapper form-container">
        <form className="form login" onSubmit={(event) => handleSubmit(event)}>
          <h1 className="title">Welcome back</h1>
          <p className="subtitle">Sign in to continue chatting</p>

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
              Don't have an account?{" "}
              <button
                type="button"
                onClick={() => isActive("no")}
                className="login-link"
              >
                Create One
              </button>
            </span>
          </div>
        </form>
      </div>
      <ToastContainer />
    </>
  );
}

export default Login;
