import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import axiosInstance from '../../api/axios';
import { ENDPOINTS } from '../../api/endpoints';
import { ROUTES } from '../../utils/constants';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import AuthSplitLayout from '../../components/auth/AuthSplitLayout';

const ResetPassword = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState(location.state?.email || '');
  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const validationError = useMemo(() => {
    if (!confirmPassword) return '';
    if (newPassword !== confirmPassword) return 'Security Protocols: Passwords do not match';
    if (newPassword.length > 0 && newPassword.length < 8) return 'Security Protocols: Min. 8 chars required';
    return '';
  }, [newPassword, confirmPassword]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (validationError) {
      setError(validationError);
      return;
    }

    setIsLoading(true);

    try {
      const res = await axiosInstance.post(ENDPOINTS.AUTH.RESET_PASSWORD, {
        token: token.trim(),
        email: email.trim(),
        new_password: newPassword,
      });

      setSuccess(res?.data?.message || 'Access restored. Credentials updated.');
      setTimeout(() => navigate(ROUTES.LOGIN), 2000);
    } catch (err) {
      setError(err?.response?.data?.message || 'Verification failed. OTP denied.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthSplitLayout
      title="Reset password"
      subtitle="Enter your verification code and set a new password for your account."
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
          variant="light"
          inputClassName="h-10 sm:h-11 rounded-xl"
          required
        />

        <Input
          id="token"
          label="Verification code"
          type="text"
          icon="key"
          placeholder="6-digit code"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          inputMode="numeric"
          maxLength={6}
          autoFocus={!!email}
          variant="light"
          inputClassName="h-10 sm:h-11 rounded-xl tracking-[0.28em]"
          required
        />

        <div className="grid grid-cols-1 gap-4">
          <Input
            id="new-password"
            label="New password"
            type={showNewPassword ? 'text' : 'password'}
            icon="shield_lock"
            placeholder="Enter new password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            variant="light"
            inputClassName="h-10 sm:h-11 rounded-xl"
            rightAdornment={(
              <button
                type="button"
                onClick={() => setShowNewPassword((prev) => !prev)}
                className="rounded-full p-1.5 text-slate-400 hover:text-slate-700 transition-all hover:bg-slate-100"
                aria-label={showNewPassword ? 'Hide new password' : 'Show new password'}
              >
                <span className="material-symbols-outlined text-[18px] sm:text-[20px]">{showNewPassword ? 'visibility_off' : 'visibility'}</span>
              </button>
            )}
            required
          />

          <Input
            id="confirm-password"
            label="Confirm password"
            type={showConfirmPassword ? 'text' : 'password'}
            icon="lock_open_right"
            placeholder="Re-enter new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            variant="light"
            error={validationError}
            inputClassName="h-10 sm:h-11 rounded-xl"
            rightAdornment={(
              <button
                type="button"
                onClick={() => setShowConfirmPassword((prev) => !prev)}
                className="rounded-full p-1.5 text-slate-400 hover:text-slate-700 transition-all hover:bg-slate-100"
                aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
              >
                <span className="material-symbols-outlined text-[18px] sm:text-[20px]">{showConfirmPassword ? 'visibility_off' : 'visibility'}</span>
              </button>
            )}
            required
          />
        </div>

        {error && (
          <div className="rounded-xl bg-red-50 p-3 flex items-start gap-2 border border-red-100">
            <span className="material-symbols-outlined text-red-600 font-black text-lg">key_off</span>
            <p className="text-xs font-semibold text-red-600 leading-snug pt-0.5">{error}</p>
          </div>
        )}

        {success && (
          <div className="rounded-xl bg-emerald-50 p-3 flex items-start gap-2 border border-emerald-100">
            <span className="material-symbols-outlined text-emerald-600 font-black text-lg">verified_user</span>
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
          {isLoading ? 'Resetting password...' : 'Reset password'}
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

export default ResetPassword;
