'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Icon from '@/components/ui/Icon';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const supabase = createClient();
      const fn =
        mode === 'login'
          ? supabase.auth.signInWithPassword({ email, password })
          : supabase.auth.signUp({ email, password });
      const { error: authError } = await fn;
      if (authError) {
        setError(traducirError(authError.message));
        return;
      }
      // Con "Confirm email" desactivado, el registro deja la sesión activa de inmediato.
      router.replace('/');
      router.refresh();
    } catch {
      setError('No se pudo conectar. Revisa tu conexión e intenta de nuevo.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="container">
      <header className="banner">
        <div className="banner-icon" aria-hidden="true"><Icon name="utensils" size={26} /></div>
        <div>
          <h1 className="banner-title">Registro Calórico</h1>
          <p className="banner-sub">{mode === 'login' ? 'Inicia sesión' : 'Crea tu cuenta'}</p>
        </div>
      </header>

      <form className="auth-form" onSubmit={onSubmit}>
        {error && <div className="error-banner">{error}</div>}

        <label className="field">
          <span>Correo</span>
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@correo.com"
          />
        </label>

        <label className="field">
          <span>Contraseña</span>
          <input
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Mínimo 6 caracteres"
          />
        </label>

        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Un momento…' : mode === 'login' ? 'Entrar' : 'Registrarme'}
        </button>
      </form>

      <p className="auth-switch">
        {mode === 'login' ? '¿No tienes cuenta?' : '¿Ya tienes cuenta?'}{' '}
        <button
          type="button"
          className="link-btn"
          onClick={() => {
            setError('');
            setMode(mode === 'login' ? 'signup' : 'login');
          }}
        >
          {mode === 'login' ? 'Regístrate' : 'Inicia sesión'}
        </button>
      </p>
    </main>
  );
}

function traducirError(msg) {
  const m = (msg || '').toLowerCase();
  if (m.includes('invalid login credentials')) return 'Correo o contraseña incorrectos.';
  if (m.includes('user already registered')) return 'Ese correo ya está registrado. Inicia sesión.';
  if (m.includes('password')) return 'La contraseña debe tener al menos 6 caracteres.';
  return 'No se pudo completar. Intenta de nuevo.';
}
