import { useState } from 'react';
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

import Login from '../components/Authorization/Login';
import Register from '../components/Authorization/Register';
import logo from '../assets/logo.svg';

function Authorization({ initialMode = 'yes' }) {
  const [isLoginActive, setIsLoginActive] = useState(initialMode);

  return (
    <>
      <div className='auth'>
        <div className="auth-wrapper">
          <div className="auth-brand">
            <img src={logo} alt="Orbit Logo" className="auth-brand-logo" />
            <span className="auth-brand-name">Orbit</span>
          </div>
          {isLoginActive === 'yes'
            ? <Login isActive={setIsLoginActive} />
            : <Register isLoginActive={setIsLoginActive} />
          }
        </div>
      </div>
      <ToastContainer />
    </>
  );
}

export default Authorization;
