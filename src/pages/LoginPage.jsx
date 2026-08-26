import { useState, useEffect } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { Lock, Mail, ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import AuthBackground from '../components/ui/AuthBackground';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, isLoading, error: authError } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState('');
  const location = useLocation();

  // Đọc query param ?error=oauth_failed khi OAuth cụ redirect về với lỗi
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('error') === 'oauth_failed') {
      setLocalError('Đăng nhập OAuth thất bại. Vui lòng thử lại hoặc sử dụng Email để đăng nhập.');
    }
  }, [location.search]);

  const validateEmail = (val) => {
    const regex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!regex.test(val)) {
      return 'Email không hợp lệ. Vui lòng nhập đúng định dạng (Ví dụ: name@gmail.com)';
    }
    return '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalError('');

    const emailErr = validateEmail(email);
    if (emailErr) {
      setLocalError(emailErr);
      return;
    }

    try {
      await login(email, password);
      navigate('/app');
    } catch (err) {
      console.error('Đăng nhập thất bại:', err);
    }
  };

  const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api/v1';

  const handleSocialLogin = (providerName) => {
    if (providerName === 'Google') {
      window.location.href = `${apiBase}/auth/google`;
    } else if (providerName === 'GitHub') {
      window.location.href = `${apiBase}/auth/github`;
    } else if (providerName === 'Facebook') {
      window.location.href = `${apiBase}/auth/facebook`;
    } else {
      setLocalError(`Đăng nhập bằng ${providerName} sắp ra mắt. Vui lòng sử dụng Google, GitHub, Facebook hoặc Email!`);
    }
  };

  const displayError = localError || authError;

  return (
    <AuthBackground>
      {/* Auth Card */}
      <div className="w-full max-w-[460px] bg-slate-900/70 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl shadow-black/50 ring-1 ring-white/5 relative z-10">
        <h1 className="text-2xl font-bold text-center text-white tracking-tight">
          Đăng nhập driveR
        </h1>
        <p className="text-sm font-medium text-slate-400 text-center mt-2 mb-6">
        </p>

        {/* Social login buttons */}
        <div className="flex gap-3 mb-6">
          {/* Google */}
          <button
            type="button"
            onClick={() => handleSocialLogin('Google')}
            className="group flex-1 h-12 rounded-xl text-white bg-white/[0.03] border border-white/10 hover:border-white/25 hover:bg-white/[0.08] transition-all duration-200 flex items-center justify-center cursor-pointer shadow-sm"
            title="Đăng nhập bằng Google"
          >
            <svg className="w-6 h-6 grayscale opacity-75 group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-200" viewBox="0 0 24 24">
              <path
                fill="#EA4335"
                d="M12 5c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.3 1.7 14.8 1 12 1 7.5 1 3.7 3.6 1.9 7.3l3.7 2.9C6.5 7.3 9 5 12 5z"
              />
              <path
                fill="#4285F4"
                d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.8z"
              />
              <path
                fill="#FBBC05"
                d="M5.6 14.8c-.3-.8-.4-1.8-.4-2.8s.1-2 .4-2.8L1.9 6.3C.7 8.7 0 10.3 0 12s.7 3.3 1.9 5.7l3.7-2.9z"
              />
              <path
                fill="#34A853"
                d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.5-2.3-6.4-5.2L1.9 16C3.7 19.7 7.5 23 12 23z"
              />
            </svg>
          </button>

          {/* Facebook */}
          <button
            type="button"
            onClick={() => handleSocialLogin('Facebook')}
            className="group flex-1 h-12 rounded-xl text-white bg-white/[0.03] border border-white/10 hover:border-white/25 hover:bg-white/[0.08] transition-all duration-200 flex items-center justify-center cursor-pointer shadow-sm"
            title="Đăng nhập bằng Facebook"
          >
            <svg className="w-6 h-6 text-slate-400 group-hover:text-[#1877F2] transition-colors duration-200 fill-current" viewBox="0 0 24 24">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
            </svg>
          </button>

          {/* GitHub */}
          <button
            type="button"
            onClick={() => handleSocialLogin('GitHub')}
            className="group flex-1 h-12 rounded-xl text-white bg-white/[0.03] border border-white/10 hover:border-white/25 hover:bg-white/[0.08] transition-all duration-200 flex items-center justify-center cursor-pointer shadow-sm"
            title="Đăng nhập bằng GitHub"
          >
            <svg className="w-6 h-6 text-slate-400 group-hover:text-white transition-colors duration-200 fill-current" viewBox="0 0 24 24">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
            </svg>
          </button>
        </div>

        {/* Divider */}
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-white/10" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-slate-900/90 px-3 text-slate-400 font-bold tracking-wider">
              HOẶC EMAIL
            </span>
          </div>
        </div>

        {displayError && (
          <div className="p-3 mb-5 bg-red-500/20 border border-red-500/30 rounded-xl text-sm text-red-300 text-center font-semibold">
            {displayError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="text-sm text-slate-300 block mb-2 font-bold">Email</label>
            <div className="relative">
              <Mail className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@gmail.com"
                required
                className="w-full h-12 pl-12 pr-4 rounded-xl text-base font-semibold text-white bg-transparent border border-white/10 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 outline-none transition placeholder-slate-500"
              />
            </div>
          </div>

          <div>
            <label className="text-sm text-slate-300 block mb-2 font-bold">Mật khẩu</label>
            <div className="relative">
              <Lock className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full h-12 pl-12 pr-4 rounded-xl text-base font-semibold text-white bg-transparent border border-white/10 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 outline-none transition placeholder-slate-500"
              />
            </div>
          </div>

          {/* CTA — điểm nhấn DUY NHẤT trong toàn bộ card */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full h-12 mt-6 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-base font-bold tracking-wide transition flex items-center justify-center gap-2.5 disabled:opacity-50 shadow-lg shadow-blue-600/25 cursor-pointer"
          >
            <span>{isLoading ? 'Đang xử lý...' : 'Vào Workspace'}</span>
            <ArrowRight className="w-5 h-5" />
          </button>

          <div className="text-center text-sm font-medium text-slate-400 pt-3">
            Chưa có tài khoản?{' '}
            <Link to="/register" className="text-blue-400 hover:underline font-bold">
              Đăng ký ngay
            </Link>
          </div>
        </form>
      </div>
    </AuthBackground>
  );
}
