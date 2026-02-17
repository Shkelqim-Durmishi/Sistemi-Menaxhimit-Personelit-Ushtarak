import { useState, FormEvent } from 'react';
import { login, getRole, changePasswordFirstLogin } from '../lib/api';
import { useNavigate } from 'react-router-dom';

import { FaUser } from 'react-icons/fa';
import { HiLockClosed } from 'react-icons/hi';

import fskLogo from '../assets/fsk-logo.png';

export default function Login() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');

    const [mustChange, setMustChange] = useState(false);
    const [newPassword, setNewPassword] = useState('');
    const [newPassword2, setNewPassword2] = useState('');

    const [pendingUsername, setPendingUsername] = useState('');
    const [pendingOldPassword, setPendingOldPassword] = useState('');

    const [loading, setLoading] = useState(false);
    const nav = useNavigate();

    async function redirectAfterLogin() {
        const role = getRole();
        if (role === 'COMMANDER' || role === 'ADMIN') nav('/dashboard');
        else nav('/');
    }

    async function handleLogin(e: FormEvent) {
        e.preventDefault();
        setLoading(true);

        try {
            const user = await login(username, password);

            if (user.mustChangePassword === true) {
                setMustChange(true);
                setPendingUsername(username);
                setPendingOldPassword(password);
                setNewPassword('');
                setNewPassword2('');
                alert('Ky përdorues duhet ta ndryshojë fjalëkalimin para se të vazhdojë.');
                return;
            }

            await redirectAfterLogin();
        } catch (err: any) {
            alert('Përdoruesi ose fjalëkalimi nuk janë të saktë.');
        } finally {
            setLoading(false);
        }
    }

    async function handleChangePasswordFirst(e: FormEvent) {
        e.preventDefault();

        if (newPassword !== newPassword2) {
            alert('Fjalëkalimet nuk përputhen.');
            return;
        }

        setLoading(true);
        try {
            await changePasswordFirstLogin(pendingUsername, pendingOldPassword, newPassword);
            await login(pendingUsername, newPassword);
            await redirectAfterLogin();
        } finally {
            setLoading(false);
        }
    }

    // ✅ FLOATING LABEL FIX (works even if tailwind doesn't support peer-not-placeholder-shown)
    const floatingLabel = `
    absolute left-7 top-1/2 -translate-y-1/2
    text-sm text-gray-500 transition-all duration-200
    pointer-events-none
 
    peer-focus:top-1 peer-focus:-translate-y-0 peer-focus:text-xs
 
    peer-[&:not(:placeholder-shown)]:top-1
    peer-[&:not(:placeholder-shown)]:-translate-y-0
    peer-[&:not(:placeholder-shown)]:text-xs
  `;

    return (
        <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-[#f3f5f8]">
            <div className="w-full max-w-5xl bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100">
                <div className="grid grid-cols-1 md:grid-cols-2">
                    {/* LEFT: Logo */}
                    <div className="hidden md:flex items-center justify-center bg-[#f6f7fb] p-10">
                        <img
                            src={fskLogo}
                            alt="FSK"
                            className="w-72 h-72 object-contain drop-shadow-md"
                        />
                    </div>

                    {/* RIGHT: Form */}
                    <div className="p-8 md:p-12">
                        {!mustChange ? (
                            <form onSubmit={handleLogin} className="space-y-10">
                                <h1 className="text-3xl font-semibold text-gray-800">Sign in</h1>

                                {/* Username */}
                                <div className="relative">
                                    <FaUser className="absolute left-0 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input
                                        value={username}
                                        onChange={(e) => setUsername(e.target.value)}
                                        placeholder=" "
                                        className="peer w-full bg-transparent outline-none py-3 pl-7 border-b-2 border-red-300 focus:border-[#C9A24D]"
                                    />
                                    <label className={floatingLabel}>Username</label>
                                </div>

                                {/* Password */}
                                <div className="relative">
                                    <HiLockClosed className="absolute left-0 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input
                                        type="password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder=" "
                                        className="peer w-full bg-transparent outline-none py-3 pl-7 border-b-2 border-gray-300 focus:border-[#2F3E2E]"
                                    />
                                    <label className={floatingLabel}>Password</label>
                                </div>

                                <button
                                    disabled={loading}
                                    className="
                    w-full rounded-full py-3 text-sm font-semibold text-white
                    bg-gradient-to-r from-[#2F3E2E] to-[#C9A24D]
                    hover:from-[#263325] hover:to-[#b8953f]
                    shadow-md hover:shadow-lg
                    transition-all duration-300
                    disabled:opacity-60
                  "
                                >
                                    {loading ? 'Duke u futur…' : 'Login'}
                                </button>
                            </form>
                        ) : (
                            <form onSubmit={handleChangePasswordFirst} className="space-y-10">
                                <h1 className="text-3xl font-semibold text-gray-800">
                                    Ndrysho fjalëkalimin
                                </h1>

                                <div className="relative">
                                    <HiLockClosed className="absolute left-0 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input
                                        type="password"
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        placeholder=" "
                                        className="peer w-full bg-transparent outline-none py-3 pl-7 border-b-2 border-gray-300 focus:border-[#2F3E2E]"
                                    />
                                    <label className={floatingLabel}>Fjalëkalimi i ri</label>
                                </div>

                                <div className="relative">
                                    <HiLockClosed className="absolute left-0 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input
                                        type="password"
                                        value={newPassword2}
                                        onChange={(e) => setNewPassword2(e.target.value)}
                                        placeholder=" "
                                        className="peer w-full bg-transparent outline-none py-3 pl-7 border-b-2 border-gray-300 focus:border-[#2F3E2E]"
                                    />
                                    <label className={floatingLabel}>Përsërit fjalëkalimin</label>
                                </div>

                                <button
                                    disabled={loading}
                                    className="
                    w-full rounded-full py-3 text-sm font-semibold text-white
                    bg-gradient-to-r from-[#2F3E2E] to-[#C9A24D]
                    hover:from-[#263325] hover:to-[#b8953f]
                    shadow-md hover:shadow-lg
                    transition-all duration-300
                    disabled:opacity-60
                  "
                                >
                                    {loading ? 'Duke u ruajtur…' : 'Ruaj fjalëkalimin e ri'}
                                </button>
                            </form>
                        )}
                    </div>
                </div>
            </div>

            <div className="mt-6 text-xs text-gray-400">
                © 2026 FSK • Sistemi i menaxhimit
            </div>
        </div>
    );
}