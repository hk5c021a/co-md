import { useState, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useThemeStore, useLanguageStore } from '../store/index';
import {
  passwordResetSchema,
  translateZodError,
  calcPasswordStrength,
  inputCls,
  type PasswordResetFormValues,
} from '../lib/validation';
import { MdLightMode, MdDarkMode, MdTranslate, MdCheck, MdClose, MdSecurity } from 'react-icons/md';
import { PasswordInput } from '../components/ui/password-input';
import { Tooltip } from '../components/ui/tooltip';
import { FieldStatusIcon } from '../components/ui/field-status-icon';
import { Spinner } from '../components/ui/spinner';
import { preHashPassword } from '../lib/crypto';
import { API_BASE } from '../lib/apiClient';

type PageState = 'checking' | 'invalid' | 'ready' | 'submitting' | 'success' | 'error';

export function PasswordResetPage() {
  const { t, i18n } = useTranslation();
  const { token: paramToken } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { theme, setTheme } = useThemeStore();
  const { language, setLanguage } = useLanguageStore();

  const toggleTheme = () => setTheme(theme === 'light' ? 'dark' : 'light');
  const toggleLanguage = () => {
    const next = language === 'zh' ? 'en' : 'zh';
    setLanguage(next);
    i18n.changeLanguage(next);
  };

  const token = paramToken || searchParams.get('token') || '';
  const [pageState, setPageState] = useState<PageState>('checking');
  const [errorMsg, setErrorMsg] = useState('');
  const userSaltRef = useRef<string>('co-md-pbkdf2-salt-v1');

  // Verify token on mount + fetch the user's existing salt for same-password check
  useEffect(() => {
    if (!token) {
      setPageState('invalid');
      return;
    }
    fetch(`${API_BASE}/api/auth/password-reset/salt?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success && d.data?.salt) {
          userSaltRef.current = d.data.salt;
        }
        return fetch(`${API_BASE}/api/auth/password-reset/verify?token=${encodeURIComponent(token)}`);
      })
      .then((r) => r.json())
      .then((d) => {
        setPageState(d.data?.valid ? 'ready' : 'invalid');
      })
      .catch(() => setPageState('invalid'));
  }, [token]);

  // Auto-redirect on invalid token
  useEffect(() => {
    if (pageState === 'invalid') {
      const timer = setTimeout(() => navigate('/login', { replace: true }), 3000);
      return () => clearTimeout(timer);
    }
  }, [pageState, navigate]);

  const {
    register,
    handleSubmit,
    watch,
    clearErrors,
    setError,
    formState: { errors },
  } = useForm<PasswordResetFormValues>({
    resolver: zodResolver(passwordResetSchema),
    defaultValues: { password: '', confirmPassword: '' },
    mode: 'onChange',
  });

  const watchPassword = watch('password');
  const confirmPwd = watch('confirmPassword');
  const confirmPwdMismatch = confirmPwd && confirmPwd !== watchPassword;

  // When password changes and confirmPassword has a value, sync the mismatch state
  useEffect(() => {
    if (watchPassword && confirmPwd) {
      if (watchPassword === confirmPwd) {
        clearErrors('confirmPassword');
      } else {
        setError('confirmPassword', {
          type: 'manual',
          message: t('auth.passwordMismatch'),
        });
      }
    }
  }, [watchPassword, confirmPwd, clearErrors, setError, t]);

  // Async: check whether the new password matches the current one (debounced)
  const [samePwdStatus, setSamePwdStatus] = useState<'idle' | 'checking' | 'same'>('idle');
  const samePwdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!watchPassword || watchPassword.length < 12 || !token) {
      setSamePwdStatus('idle');
      // Clear any previous "same password" error so it doesn't linger
      // when the user types a genuinely different password
      return;
    }
    if (samePwdTimer.current) clearTimeout(samePwdTimer.current);
    setSamePwdStatus('checking');
    samePwdTimer.current = setTimeout(async () => {
      try {
        const salt = userSaltRef.current;
        const hash = await preHashPassword(watchPassword, salt);
        const res = await fetch(`${API_BASE}/api/auth/password-reset/check`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, passwordHash: hash }),
        });
        const data = await res.json();
        if (data.success && data.data?.same) {
          setSamePwdStatus('same');
          setError('password', { type: 'manual', message: t('auth.passwordNotDifferent') });
        } else {
          setSamePwdStatus('idle');
          // Clear the manual error when passwords differ (but keep Zod errors)
          if (errors.password?.type === 'manual') clearErrors('password');
        }
      } catch {
        setSamePwdStatus('idle');
      }
    }, 600);
    return () => {
      if (samePwdTimer.current) clearTimeout(samePwdTimer.current);
    };
  }, [watchPassword, token, setError, clearErrors, t, errors.password?.type]);

  const passwordStrength = calcPasswordStrength(watchPassword || '');

  const passwordReqsAllMet =
    watchPassword &&
    watchPassword.length >= 12 &&
    /[a-zA-Z]/.test(watchPassword) &&
    /\d/.test(watchPassword) &&
    /[^a-zA-Z0-9]/.test(watchPassword);

  const [hidePasswordBubble, setHidePasswordBubble] = useState(false);
  const passwordBubbleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (passwordReqsAllMet) {
      passwordBubbleTimer.current = setTimeout(() => setHidePasswordBubble(true), 2000);
    } else {
      if (passwordBubbleTimer.current) clearTimeout(passwordBubbleTimer.current);
      setHidePasswordBubble(false);
    }
    return () => {
      if (passwordBubbleTimer.current) clearTimeout(passwordBubbleTimer.current);
    };
  }, [passwordReqsAllMet]);

  const onSubmit = async (data: PasswordResetFormValues) => {
    setErrorMsg('');
    setPageState('submitting');
    try {
      // Use the user's existing salt so the backend can detect same-password.
      // A fresh salt would produce a different PBKDF2 hash even for the same
      // raw password, making the server-side bcrypt compare useless.
      const salt = userSaltRef.current;
      const newPasswordHash = await preHashPassword(data.password, salt);

      const res = await fetch(`${API_BASE}/api/auth/password-reset/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPasswordHash, newPbkdf2Salt: salt }),
      });
      const json = await res.json();
      if (!json.success) {
        const code = json.error?.code;
        if (code === 'SAME_PASSWORD') throw new Error(t('auth.passwordNotDifferent'));
        if (code === 'INVALID_TOKEN') throw new Error(t('auth.resetError'));
        throw new Error(json.error?.message || t('auth.resetError'));
      }
      setPageState('success');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : t('auth.resetError'));
      setPageState('error');
    }
  };

  // Auto-redirect after successful reset
  useEffect(() => {
    if (pageState === 'success') {
      const timer = setTimeout(() => navigate('/login', { replace: true }), 3000);
      return () => clearTimeout(timer);
    }
  }, [pageState, navigate]);

  // ── Checking state ──
  if (pageState === 'checking') {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-bg dark:bg-zinc-950 px-4">
        <a href="#main-content" className="skip-to-main">
          {t('common.skipToMain')}
        </a>
        <main id="main-content">
          <Spinner size="lg" />
        </main>
      </div>
    );
  }

  // ── Invalid token ──
  if (pageState === 'invalid') {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-bg dark:bg-zinc-950 px-4">
        <a href="#main-content" className="skip-to-main">
          {t('common.skipToMain')}
        </a>
        <main id="main-content" className="max-w-md w-full text-center p-8">
          <div className="mb-6 flex justify-center">
            <div className="p-4 rounded-full bg-warning/10 dark:bg-warning/20">
              <MdSecurity className="h-16 w-16 text-warning dark:text-warning" />
            </div>
          </div>
          <h1 className="text-xl font-semibold text-text-primary dark:text-zinc-100 mb-2">
            {!token ? t('pwdReset.tokenMissing') : t('pwdReset.tokenInvalid')}
          </h1>
          <p className="text-text-secondary dark:text-zinc-400 mb-8">
            {t('pwdReset.tokenInvalidDesc')}
          </p>
        </main>
      </div>
    );
  }

  // ── Success ──
  if (pageState === 'success') {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-bg dark:bg-zinc-950 px-4">
        <a href="#main-content" className="skip-to-main">
          {t('common.skipToMain')}
        </a>
        <div className="fixed top-4 right-4 flex gap-2">
          <button
            onClick={toggleLanguage}
            className="p-2 rounded-full bg-surface dark:bg-zinc-900 border border-border dark:border-zinc-700 flex items-center gap-1"
            aria-label={language === 'zh' ? t('home.switchToEnglish') : t('home.switchToChinese')}
          >
            <MdTranslate className="h-5 w-5" />
            <span className="text-[13px] font-medium">
              {language === 'zh' ? t('home.chinese') : t('home.english')}
            </span>
          </button>
          <button
            onClick={toggleTheme}
            className="p-2 rounded-full bg-surface dark:bg-zinc-900 border border-border dark:border-zinc-700"
            aria-label={theme === 'light' ? t('home.dark') : t('home.light')}
          >
            {theme === 'light' ? (
              <MdLightMode className="h-5 w-5" />
            ) : (
              <MdDarkMode className="h-5 w-5" />
            )}
          </button>
        </div>
        <main id="main-content" className="max-w-md w-full text-center p-8 bg-bg dark:bg-zinc-900">
          <div className="text-4xl mb-4" aria-hidden="true">
            ✓
          </div>
          <h1 className="text-2xl font-bold font-display tracking-tight text-text-primary dark:text-zinc-100">
            {t('pwdReset.success')}
          </h1>
          <p className="text-text-secondary dark:text-zinc-400 mt-2">{t('pwdReset.successDesc')}</p>
        </main>
      </div>
    );
  }

  // ── Ready / Submitting / Error ──
  return (
    <div className="min-h-dvh flex items-center justify-center bg-bg dark:bg-zinc-950 px-4">
      <a href="#main-content" className="skip-to-main">
        {t('common.skipToMain')}
      </a>
      <div className="fixed top-3 right-3 sm:top-4 sm:right-4 flex gap-1.5 sm:gap-2 z-30">
        <button
          onClick={toggleLanguage}
          className="p-2 rounded-full bg-surface/80 dark:bg-zinc-900/80 backdrop-blur border border-border dark:border-zinc-700 flex items-center gap-1 hover:bg-surface dark:hover:bg-zinc-800 transition-colors"
          aria-label={language === 'zh' ? t('home.switchToEnglish') : t('home.switchToChinese')}
          title={language === 'zh' ? t('home.switchToEnglish') : t('home.switchToChinese')}
        >
          <MdTranslate className="h-4 w-4 sm:h-5 sm:w-5" />
          <span className="text-[13px] font-medium hidden sm:inline">
            {language === 'zh' ? t('home.chinese') : t('home.english')}
          </span>
        </button>
        <button
          onClick={toggleTheme}
          className="p-2 rounded-full bg-surface/80 dark:bg-zinc-900/80 backdrop-blur border border-border dark:border-zinc-700 hover:bg-surface dark:hover:bg-zinc-800 transition-colors"
          aria-label={theme === 'light' ? t('home.dark') : t('home.light')}
          title={theme === 'light' ? t('home.dark') : t('home.light')}
        >
          {theme === 'light' ? (
            <MdLightMode className="h-4 w-4 sm:h-5 sm:w-5" />
          ) : (
            <MdDarkMode className="h-4 w-4 sm:h-5 sm:w-5" />
          )}
        </button>
      </div>
      <main id="main-content" className="max-w-md w-full space-y-6 p-8 bg-bg dark:bg-zinc-900">
        <div className="text-center">
          <h1 className="text-2xl font-bold font-display tracking-tight text-text-primary dark:text-zinc-100">
            {t('pwdReset.title')}
          </h1>
          <p className="text-text-secondary dark:text-zinc-400 mt-1">{t('pwdReset.description')}</p>
        </div>

        {errorMsg && (
          <div
            className="bg-error/10 dark:bg-error/20 text-error dark:text-error p-3 text-[15px]"
            role="alert"
          >
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div>
            <label
              htmlFor="password"
              className="block text-[13px] font-medium text-primary-700 dark:text-zinc-300"
            >
              {t('pwdReset.newPassword')}
            </label>
            <Tooltip
              content={
                errors.password ? (
                  translateZodError(errors.password.message, t)
                ) : samePwdStatus === 'checking' && watchPassword ? (
                  t('auth.checking')
                ) : watchPassword && !hidePasswordBubble ? (
                  <div className="space-y-1.5 min-w-48">
                    <div className="flex gap-1">
                      {[0, 1, 2, 3].map((i) => (
                        <div
                          key={i}
                          className={`h-1 flex-1 rounded-full ${i < passwordStrength.score ? passwordStrength.color : 'bg-bg/30'}`}
                        />
                      ))}
                    </div>
                    <p className="opacity-90">
                      {t('auth.passwordStrength')}:{' '}
                      {passwordStrength.score <= 1
                        ? t('auth.passwordStrengthWeak')
                        : passwordStrength.score === 2
                          ? t('auth.passwordStrengthFair')
                          : passwordStrength.score === 3
                            ? t('auth.passwordStrengthGood')
                            : t('auth.passwordStrengthStrong')}
                    </p>
                    <div className="space-y-0.5 pt-1.5 border-t border-border/30 dark:border-white/20">
                      {[
                        { met: watchPassword.length >= 12, label: t('auth.passwordReqLength') },
                        { met: /[a-zA-Z]/.test(watchPassword), label: t('auth.passwordReqLetter') },
                        { met: /\d/.test(watchPassword), label: t('auth.passwordReqDigit') },
                        {
                          met: /[^a-zA-Z0-9]/.test(watchPassword),
                          label: t('auth.passwordReqSpecial'),
                        },
                      ].map((req, i) => (
                        <p
                          key={req.label}
                          className={`flex items-center gap-1 ${req.met ? 'opacity-90' : 'opacity-50'}`}
                        >
                          {req.met ? (
                            <MdCheck className="h-3 w-3" />
                          ) : (
                            <MdClose className="h-3 w-3" />
                          )}
                          {req.label}
                        </p>
                      ))}
                    </div>
                  </div>
                ) : undefined
              }
              variant={errors.password ? 'error' : samePwdStatus === 'checking' ? 'info' : 'info'}
              className="block w-full"
            >
              <PasswordInput
                id="password"
                {...register('password')}
                className={inputCls(!!errors.password)}
                placeholder={t('auth.passwordPlaceholder')}
                autoComplete="new-password"
                autoFocus
                icon={
                  <FieldStatusIcon
                    status={
                      errors.password
                        ? 'error'
                        : samePwdStatus === 'checking'
                          ? 'checking'
                          : watchPassword
                            ? 'success'
                            : ''
                    }
                  />
                }
              />
            </Tooltip>
          </div>

          <div>
            <label
              htmlFor="confirmPassword"
              className="block text-[13px] font-medium text-primary-700 dark:text-zinc-300"
            >
              {t('pwdReset.confirmPassword')}
            </label>
            <Tooltip
              content={
                translateZodError(errors.confirmPassword?.message, t) ||
                (confirmPwdMismatch ? t('auth.validationPasswordMismatch') : '')
              }
              className="block w-full"
            >
              <PasswordInput
                id="confirmPassword"
                {...register('confirmPassword')}
                className={inputCls(!!(errors.confirmPassword || confirmPwdMismatch))}
                autoComplete="new-password"
                icon={
                  <FieldStatusIcon
                    status={
                      errors.confirmPassword || confirmPwdMismatch
                        ? 'error'
                        : confirmPwd && watchPassword === confirmPwd
                          ? 'success'
                          : ''
                    }
                  />
                }
              />
            </Tooltip>
          </div>

          <button
            type="submit"
            disabled={pageState === 'submitting'}
            className="w-full py-2.5 px-4 bg-primary hover:bg-primary-600 text-white font-medium text-[15px] rounded-sm hover:-translate-y-px hover:shadow-btn-glow transition-all focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/12 disabled:opacity-50 mt-2"
          >
            {pageState === 'submitting' ? t('pwdReset.submitting') : t('pwdReset.submit')}
          </button>
        </form>

        <div className="text-center text-[15px]">
          <a href="/login" className="text-primary hover:text-primary dark:text-primary">
            {t('pwdReset.returnToSignIn')}
          </a>
        </div>
      </main>
    </div>
  );
}
