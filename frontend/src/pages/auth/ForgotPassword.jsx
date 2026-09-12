import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axiosInstance from '../../api/axios';
import { ENDPOINTS } from '../../api/endpoints';
import { ROUTES } from '../../utils/constants';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import AuthSplitLayout from '../../components/auth/AuthSplitLayout';

const ForgotPassword = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setIsLoading(true);

    try {
      const res = await axiosInstance.post(ENDPOINTS.AUTH.FORGOT_PASSWORD, { email });
      setSuccess(res?.data?.message || 'Identity verified. OTP code dispatched.');
      setTimeout(() => {
        navigate(ROUTES.RESET_PASSWORD, { state: { email } });
      }, 2000);
    } catch (err) {
      setError(err?.response?.data?.message || 'Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthSplitLayout
      title="Forgot password"
      subtitle="Enter your account email and we’ll send a verification code to reset your password."
      sideImage="/auth_forgot_side_2.png"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          id="email"
          label="Email"
          type="email"
          icon="mail"
          placeholder="pilot@varuna.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoFocus
          autoComplete="email"
          variant="light"
          inputClassName="h-10 sm:h-11 rounded-xl"
          required
        />

        {error && (
          <div className="rounded-xl bg-red-50 p-3 flex items-start gap-2 border border-red-100">
            <span className="material-symbols-outlined text-red-500 text-lg font-black">lock</span>
            <p className="text-xs font-semibold text-red-600 leading-snug pt-0.5">{error}</p>
          </div>
        )}

        {success && (
          <div className="rounded-xl bg-emerald-50 p-3 flex items-start gap-2 border border-emerald-100">
            <span className="material-symbols-outlined text-emerald-600 text-lg font-black">verified</span>
            <p className="text-xs font-semibold text-emerald-700 leading-snug pt-0.5">{success}</p>
          </div>
        )}

        <Button
          type="submit"
          variant="primary"
          size="lg"
          isLoading={isLoading}
          className="w-full h-10 sm:h-11 rounded-xl text-[13px] font-bold uppercase tracking-[0.15em] active:scale-[0.99] transition-all duration-300 shadow-md mt-2"
        >
          {isLoading ? 'Sending code...' : 'Send reset code'}
        </Button>

        <div className="pt-1 text-center">
          <Link
            to={ROUTES.LOGIN}
            className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-700 hover:text-slate-700 transition-colors p-1"
          >
            ← Back to login
          </Link>
        </div>
      </form>
    </AuthSplitLayout>
  );
};

export default ForgotPassword;
