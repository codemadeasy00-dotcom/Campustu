import { useState, useEffect } from 'react';
import { authApi } from './services/api';

export default function App() {
  const [step, setStep] = useState('signup'); // 'signup', 'verify', or 'dashboard'
  const [email, setEmail] = useState('student@dbatu.ac.in');
  const [fullName, setFullName] = useState('Pranav');
  const [displayName, setDisplayName] = useState('Pranav');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [user, setUser] = useState(null);

  // Check if token already exists on load
  useEffect(() => {
    const token = localStorage.getItem('campustu_token');
    if (token) {
      authApi.getMe()
        .then((data) => {
          setUser(data.user);
          setStep('dashboard');
        })
        .catch(() => {
          localStorage.removeItem('campustu_token');
        });
    }
  }, []);

  const handleSignup = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await authApi.signup({
        email,
        full_name: fullName,
        display_name: displayName,
        branch_id: 1,
        admission_year: 2024
      });
      setStep('verify');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await authApi.verify({ email, code });
      localStorage.setItem('campustu_token', data.token);
      setUser(data.user);
      setStep('dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('campustu_token');
    setUser(null);
    setCode('');
    setStep('signup');
  };

  return (
    <div className="min-h-screen bg-[#F4F7F2] text-[#2C3E35] flex flex-col items-center justify-center p-4 font-sans relative overflow-hidden">
      
      {/* Decorative background grid pattern for that cozy notebook/plaid feel */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#2C3E35 1px, transparent 1px)', backgroundSize: '24px 24px' }}></div>

      <div className="max-w-sm w-full bg-[#FFFFFF] border-2 border-[#D8E6D3] rounded-[32px] shadow-[0_12px_32px_rgba(44,62,53,0.08)] p-8 relative z-10">
        
        {/* App Title / Header */}
        <div className="text-center mb-8">
          <div className="inline-block bg-[#E8F3E4] text-[#3B6E50] px-4 py-1 rounded-full text-xs font-bold tracking-wider uppercase mb-2">
            DBATU Marketplace
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-[#2C3E35]">
            Campustu 🐾
          </h1>
          <p className="text-xs text-[#6B8575] mt-1">Student peer-to-peer exchange</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 text-xs rounded-2xl text-center">
            {error}
          </div>
        )}

        {/* STEP 1: Signup Form */}
        {step === 'signup' && (
          <form onSubmit={handleSignup} className="space-y-4">
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-4 flex items-center text-[#7A9A85]">📧</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-[#F8FBF7] border border-[#D8E6D3] rounded-full pl-11 pr-4 py-3 text-sm text-[#2C3E35] placeholder-[#8FA899] focus:outline-none focus:border-[#528B6B] transition shadow-inner"
                placeholder="College Email (@dbatu.ac.in)"
              />
            </div>

            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-4 flex items-center text-[#7A9A85]">👤</span>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full bg-[#F8FBF7] border border-[#D8E6D3] rounded-full pl-11 pr-4 py-3 text-sm text-[#2C3E35] placeholder-[#8FA899] focus:outline-none focus:border-[#528B6B] transition shadow-inner"
                placeholder="Full Name"
              />
            </div>

            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-4 flex items-center text-[#7A9A85]">✨</span>
              <input
                type="text"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full bg-[#F8FBF7] border border-[#D8E6D3] rounded-full pl-11 pr-4 py-3 text-sm text-[#2C3E35] placeholder-[#8FA899] focus:outline-none focus:border-[#528B6B] transition shadow-inner"
                placeholder="Display Handle"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#4A7C59] hover:bg-[#3D684A] text-white font-bold py-3.5 px-6 rounded-full shadow-[0_4px_14px_rgba(74,124,89,0.3)] transition transform active:scale-[0.98] text-sm mt-2 disabled:opacity-50"
            >
              {loading ? 'Sending Code...' : 'Continue'}
            </button>
          </form>
        )}

        {/* STEP 2: Verify OTP Form */}
        {step === 'verify' && (
          <form onSubmit={handleVerify} className="space-y-4">
            <div className="text-center mb-4">
              <p className="text-xs text-[#6B8575]">Enter the 6-digit code sent to</p>
              <p className="text-xs font-bold text-[#3B6E50]">{email}</p>
            </div>

            <div>
              <input
                type="text"
                required
                maxLength="6"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full text-center tracking-[0.5em] text-xl font-mono bg-[#F8FBF7] border border-[#D8E6D3] rounded-full py-3 text-[#2C3E35] focus:outline-none focus:border-[#528B6B] shadow-inner"
                placeholder="••••••"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#5C8D70] hover:bg-[#4E7A60] text-white font-bold py-3.5 px-6 rounded-full shadow-[0_4px_14px_rgba(92,141,112,0.3)] transition transform active:scale-[0.98] text-sm disabled:opacity-50"
            >
              {loading ? 'Verifying...' : 'Verify & Enter'}
            </button>

            <button
              type="button"
              onClick={() => setStep('signup')}
              className="w-full text-xs text-[#7A9A85] hover:text-[#2C3E35] mt-3 font-medium transition"
            >
              ← Back to Signup
            </button>
          </form>
        )}

        {/* STEP 3: Dashboard Profile View */}
        {step === 'dashboard' && user && (
          <div className="space-y-4 text-center">
            <div className="p-4 bg-[#F8FBF7] border border-[#D8E6D3] rounded-2xl text-left space-y-2">
              <p className="text-[10px] text-[#7A9A85] uppercase font-bold tracking-wider">Active Session</p>
              <p className="text-sm font-bold text-[#2C3E35]">{user.full_name} <span className="text-xs font-normal text-[#6B8575]">({user.display_name})</span></p>
              <p className="text-xs text-[#557563]">{user.email}</p>
              <div className="pt-2 border-t border-[#E2ECE0] flex justify-between text-xs text-[#6B8575]">
                <span>Role: <strong className="text-[#3B6E50]">{user.role}</strong></span>
                <span>Status: <strong className="text-emerald-600">{user.status}</strong></span>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="w-full bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 font-semibold py-3 px-4 rounded-full transition text-xs"
            >
              Sign Out
            </button>
          </div>
        )}

      </div>

      <div className="mt-6 text-center text-xs text-[#8FA899]">
        Campustu • Secure Student P2P Platform
      </div>
    </div>
  );
}