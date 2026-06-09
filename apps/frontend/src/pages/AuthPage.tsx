import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useLogin, useRegister } from '../hooks/useApi';
import { useToken } from '../hooks/useToken';
import { API_BASE } from '../lib/apiClient';
import { useThemeStore, useLanguageStore } from '../store/index';
import {
  loginSchema,
  registerSchema,
  forgotPasswordSchema,
  type LoginFormValues,
  type RegisterFormValues,
  type ForgotPasswordFormValues,
  translateZodError,
  resolveErrorText,
  apiErrorState,
  i18nError,
  calcPasswordStrength,
  inputCls,
  type ErrorState,
} from '../lib/validation';
import { ApiError } from '../hooks/useApi';
import {
  MdLightMode,
  MdDarkMode,
  MdTranslate,
  MdExpandMore,
  MdCheck,
  MdClose,
  MdArrowBack,
  MdMarkEmailUnread,
} from 'react-icons/md';
import { PasswordInput } from '../components/ui/password-input';
import { Tooltip } from '../components/ui/tooltip';
import { FieldStatusIcon } from '../components/ui/field-status-icon';
import { preHashPassword, generatePbkdf2Salt } from '../lib/crypto';

const passwordStrengthLevels = [0, 1, 2, 3];

type AuthTab = 'login' | 'register';

// ── Country codes ──

const COUNTRY_CODES = [
  { code: '+86', label: 'CN +86' },
  { code: '+1', label: 'US +1' },
  { code: '+44', label: 'GB +44' },
  { code: '+81', label: 'JP +81' },
  { code: '+82', label: 'KR +82' },
  { code: '+91', label: 'IN +91' },
  { code: '+49', label: 'DE +49' },
  { code: '+33', label: 'FR +33' },
  { code: '+61', label: 'AU +61' },
  { code: '+7', label: 'RU +7' },
  { code: '+55', label: 'BR +55' },
  { code: '+852', label: 'HK +852' },
  { code: '+886', label: 'TW +886' },
  { code: '+65', label: 'SG +65' },
];

// ── Server-side CAPTCHA ──

interface CaptchaState {
  captchaId: string;
  question: string;
}

async function fetchCaptcha(): Promise<CaptchaState> {
  const resp = await fetch(`${API_BASE}/api/auth/captcha`);
  const data = await resp.json();
  if (!data.success) {
    throw new Error('Failed to fetch CAPTCHA');
  }
  return { captchaId: data.data.captchaId, question: data.data.question };
}

function createEmptyCaptcha(): CaptchaState {
  return { captchaId: '', question: '' };
}

type AsyncStatus = Record<string, 'idle' | 'checking' | 'valid' | 'invalid'>;

// ── Page ──

export function AuthPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { theme, setTheme } = useThemeStore();
  const { language, setLanguage } = useLanguageStore();

  const [tab, setTab] = useState<AuthTab>('login');
  const [showForgotPassword, setShowForgotPassword] = useState(false);

  // Server errors
  const [loginError, setLoginError] = useState<ErrorState>(null);
  const [registerError, setRegisterError] = useState<ErrorState>(null);
  const [registerSuccess, setRegisterSuccess] = useState(false);
  const [forgotError, setForgotError] = useState<ErrorState>(null);
  const [forgotSubmitted, setForgotSubmitted] = useState(false);
  const [isForgotSubmitting, setIsForgotSubmitting] = useState(false);

  // CAPTCHA (server-side challenge)
  const [captcha, setCaptcha] = useState<CaptchaState>(createEmptyCaptcha);
  const [captchaError, setCaptchaError] = useState<ErrorState>(null);
  const [captchaLoading, setCaptchaLoading] = useState(false);

  // Async uniqueness
  const [asyncStatus, setAsyncStatus] = useState<AsyncStatus>({});
  const debounceRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const abortRef = useRef<Record<string, AbortController>>({});
  const prevValuesRef = useRef<Record<string, string>>({});

  const { isAuthenticated } = useToken();
  const login = useLogin();
  const register = useRegister();

  // Route guard — if TokenProvider reports authenticated, redirect to home
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  // Load CAPTCHA on mount
  useEffect(() => {
    refreshCaptchaFromServer();
  }, []);

  async function refreshCaptchaFromServer() {
    setCaptchaLoading(true);
    setCaptchaStatus('idle');
    try {
      const c = await fetchCaptcha();
      setCaptcha(c);
    } catch {
      // Fallback to empty — user can retry
      setCaptcha(createEmptyCaptcha());
    } finally {
      setCaptchaLoading(false);
    }
  }

  // ── Forms ──

  const loginForm = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { identifier: '', password: '', captchaAnswer: '' },
    mode: 'onTouched',
  });

  const registerForm = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      username: '',
      countryCode: '+86',
      phone: '',
      email: '',
      password: '',
      confirmPassword: '',
      captchaAnswer: '',
    },
    mode: 'onChange',
  });

  const forgotForm = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '', captchaAnswer: '' },
    mode: 'onTouched',
  });

  // Watch fields for real-time validation
  const regPassword = registerForm.watch('password');
  const watchUsername = registerForm.watch('username');
  const watchPhone = registerForm.watch('phone');
  const watchEmail = registerForm.watch('email');
  const confirmPwd = registerForm.watch('confirmPassword');
  const confirmPwdMismatch = confirmPwd && confirmPwd !== regPassword;

  // When password changes and confirmPassword has a value, sync the mismatch state
  useEffect(() => {
    if (regPassword && confirmPwd) {
      if (regPassword === confirmPwd) {
        registerForm.clearErrors('confirmPassword');
      } else {
        registerForm.setError('confirmPassword', {
          type: 'manual',
          message: t('auth.passwordMismatch'),
        });
      }
    }
  }, [regPassword, confirmPwd, t, registerForm]);

  const captchaValue = registerForm.watch('captchaAnswer');
  const loginCaptchaValue = loginForm.watch('captchaAnswer');
  const forgotCaptchaValue = forgotForm.watch('captchaAnswer');
  const forgotEmailValue = forgotForm.watch('email');

  // CAPTCHA real-time validation — compare user input against displayed question
  const [captchaStatus, setCaptchaStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const verifyCaptchaInput = (value: string): boolean => {
    if (!value || !captcha.question) return false;
    const parts = captcha.question.split(/[^0-9]+/).filter((n) => n);
    if (parts.length < 2) return false;
    return parseInt(value, 10) === parseInt(parts[0], 10) + parseInt(parts[1], 10);
  };

  // Real-time CAPTCHA validation on input change
  useEffect(() => {
    if (loginCaptchaValue) {
      const ok = verifyCaptchaInput(loginCaptchaValue);
      setCaptchaStatus(ok ? 'success' : 'error');
    } else {
      setCaptchaStatus('idle');
    }
  }, [loginCaptchaValue, captcha.question]);
  useEffect(() => {
    if (captchaValue) {
      const ok = verifyCaptchaInput(captchaValue);
      setCaptchaStatus(ok ? 'success' : 'error');
    }
  }, [captchaValue, captcha.question]);
  useEffect(() => {
    if (forgotCaptchaValue) {
      const ok = verifyCaptchaInput(forgotCaptchaValue);
      setCaptchaStatus(ok ? 'success' : 'error');
    }
  }, [forgotCaptchaValue, captcha.question]);

  // Password bubble delay hide when all requirements met
  const [hidePasswordBubble, setHidePasswordBubble] = useState(false);
  const passwordBubbleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const passwordReqsAllMet =
    regPassword &&
    regPassword.length >= 12 &&
    /[a-zA-Z]/.test(regPassword) &&
    /\d/.test(regPassword) &&
    /[^a-zA-Z0-9]/.test(regPassword);

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

  // Async validation on value change (debounced + abort previous)
  useEffect(() => {
    const prev = prevValuesRef.current['username'];
    if (watchUsername !== prev) {
      prevValuesRef.current['username'] = watchUsername;
      if (watchUsername && !registerForm.formState.errors.username) {
        checkUniqueness('username', watchUsername);
      }
    }
  // oxlint-disable-next-line react-hooks/exhaustive-deps — errors/checkUniqueness would loop
  }, [watchUsername]);

  useEffect(() => {
    const prev = prevValuesRef.current['phone'];
    if (watchPhone !== prev) {
      prevValuesRef.current['phone'] = watchPhone;
      if (watchPhone && !registerForm.formState.errors.phone) {
        const phone = `${registerForm.getValues('countryCode')}${watchPhone}`;
        checkUniqueness('phone', phone);
      }
    }
  // oxlint-disable-next-line react-hooks/exhaustive-deps — errors/checkUniqueness/registerForm would loop
  }, [watchPhone]);

  useEffect(() => {
    const prev = prevValuesRef.current['email'];
    if (watchEmail !== prev) {
      prevValuesRef.current['email'] = watchEmail;
      if (watchEmail && !registerForm.formState.errors.email) {
        checkUniqueness('email', watchEmail);
      }
    }
  // oxlint-disable-next-line react-hooks/exhaustive-deps — errors/checkUniqueness would loop
  }, [watchEmail]);

  // ── Async uniqueness check — per-field with debounce ──

  const checkUniqueness = useCallback((field: string, value: string) => {
    if (debounceRef.current[field]) clearTimeout(debounceRef.current[field]);

    if (!value.trim()) {
      setAsyncStatus((prev) => ({ ...prev, [field]: 'idle' }));
      return;
    }

    debounceRef.current[field] = setTimeout(async () => {
      if (abortRef.current[field]) abortRef.current[field].abort();
      const controller = new AbortController();
      abortRef.current[field] = controller;

      setAsyncStatus((prev) => ({ ...prev, [field]: 'checking' }));
      try {
        const params = new URLSearchParams({ [field]: value });
        const resp = await fetch(`${API_BASE}/api/auth/check?${params}`, {
          signal: controller.signal,
        });
        if (resp.status === 429) return; // rate limited — silent retry later
        const data = await resp.json();
        if (data.success) {
          const exists = !!data.data?.[field];
          const isInvalid = field === 'identifier' ? !exists : exists;
          setAsyncStatus((prev) => ({ ...prev, [field]: isInvalid ? 'invalid' : 'valid' }));
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setAsyncStatus((prev) => ({ ...prev, [field]: 'idle' }));
      }
    }, 500);
  }, []);

  const handleAsyncBlur = (field: string, value: string, hasError: boolean) => {
    if (value.trim() && !hasError) {
      checkUniqueness(field, value);
    }
  };

  // ── Submit handlers ──

  // Verify CAPTCHA answer matches the displayed question before API call
  function verifyCaptchaLocally(inputAnswer: string): boolean {
    if (!captcha.question) return false;
    const parts = captcha.question.split(/[^0-9]+/).filter((n) => n);
    if (parts.length < 2) return false;
    const expected = parseInt(parts[0], 10) + parseInt(parts[1], 10);
    return parseInt(inputAnswer, 10) === expected;
  }

  const onLogin = async (data: LoginFormValues) => {
    setLoginError(null);
    setCaptchaError(null);

    // Client-side CAPTCHA verification — only show error, don't refresh
    if (!verifyCaptchaLocally(data.captchaAnswer)) {
      setCaptchaError(i18nError('auth.captchaExpired'));
      return;
    }

    try {
      // Fetch per-user PBKDF2 salt (falls back to legacy salt for old/existing)
      const saltRes = await fetch(`${API_BASE}/api/auth/salt?identifier=${encodeURIComponent(data.identifier)}`);
      const saltJson = await saltRes.json();
      const salt = saltJson?.data?.salt;
      const passwordHash = await preHashPassword(data.password, salt);

      await login.mutateAsync({
        identifier: data.identifier,
        passwordHash,
        pbkdf2Salt: salt,
        captchaId: captcha.captchaId,
        captchaAnswer: parseInt(data.captchaAnswer, 10),
      });
      // Navigation is handled reactively: onSuccess → setAuthenticated(true)
      // → LoginRoute renders <Navigate to="/"> → HomeRoute renders UserHomePage.
    } catch (err) {
      loginForm.setValue('captchaAnswer', '');
      refreshCaptchaFromServer();
      if (err instanceof ApiError) {
        if (err.code === 'CAPTCHA_EXPIRED') {
          setCaptchaError(apiErrorState({ code: err.code, message: err.message }, 'auth.captchaExpired'));
        } else {
          setLoginError(apiErrorState({ code: err.code, message: err.message }, 'auth.loginError'));
        }
      } else {
        if (import.meta.env.DEV) console.error('Login error:', err);
        setLoginError({ raw: (err as Error).message || `[${(err as Error).name}]` });
      }
    }
  };

  const onRegister = async (data: RegisterFormValues) => {
    setRegisterError(null);
    setCaptchaError(null);

    if (!verifyCaptchaLocally(data.captchaAnswer)) {
      setCaptchaError(i18nError('auth.captchaExpired'));
      return;
    }

    try {
      const salt = generatePbkdf2Salt();
      const [passwordHash, confirmPasswordHash] = await Promise.all([
        preHashPassword(data.password, salt),
        preHashPassword(data.confirmPassword, salt),
      ]);

      const fullPhone = `${data.countryCode}${data.phone}`;
      await register.mutateAsync({
        username: data.username,
        email: data.email,
        phone: fullPhone,
        passwordHash,
        confirmPasswordHash,
        pbkdf2Salt: salt,
        captchaId: captcha.captchaId,
        captchaAnswer: parseInt(data.captchaAnswer, 10),
      });

      // Registration success: show message, delay then switch to login
      setRegisterSuccess(true);
      setTimeout(() => switchTab('login'), 2000);
    } catch (err) {
      refreshCaptchaFromServer();
      if (err instanceof ApiError) {
        if (err.code === 'CAPTCHA_EXPIRED') {
          setCaptchaError(apiErrorState({ code: err.code, message: err.message }, 'auth.captchaExpired'));
        } else {
          setRegisterError(
            apiErrorState({ code: err.code, message: err.message }, 'auth.registerError')
          );
        }
      } else {
        setRegisterError(i18nError('auth.registerError'));
      }
    }
  };

  const onForgot = async (data: ForgotPasswordFormValues) => {
    setForgotError(null);
    setCaptchaError(null);

    if (!verifyCaptchaLocally(data.captchaAnswer)) {
      setCaptchaError(i18nError('auth.captchaExpired'));
      return;
    }

    if (!captcha.captchaId) {
      setCaptchaError(i18nError('auth.captchaExpired'));
      return;
    }

    setIsForgotSubmitting(true);
    try {
      const response = await fetch(`${API_BASE}/api/auth/password-reset/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: data.email,
          lang: i18n.language,
          captchaId: captcha.captchaId,
          captchaAnswer: parseInt(data.captchaAnswer, 10),
        }),
      });
      const json = await response.json();
      if (!json.success) {
        if (json.error?.code === 'CAPTCHA_EXPIRED') {
          setCaptchaError(apiErrorState(json.error, 'auth.captchaExpired'));
        } else {
          setForgotError(apiErrorState(json.error, 'auth.resetError'));
        }
        refreshCaptchaFromServer();
        return;
      }
      setForgotSubmitted(true);
    } catch (err) {
      refreshCaptchaFromServer();
      setForgotError(i18nError('auth.resetError'));
    } finally {
      setIsForgotSubmitting(false);
    }
  };

  // ── Navigation ──

  const switchToForgot = () => {
    setLoginError(null);
    setForgotError(null);
    setCaptchaError(null);
    loginForm.reset();
    forgotForm.reset();
    refreshCaptchaFromServer();
    setShowForgotPassword(true);
  };

  const switchToLogin = () => {
    setShowForgotPassword(false);
    setForgotError(null);
    setCaptchaError(null);
    forgotForm.reset();
    loginForm.setValue('captchaAnswer', '');
    refreshCaptchaFromServer();
  };

  const switchTab = (tKey: AuthTab) => {
    setTab(tKey);
    setLoginError(null);
    setRegisterError(null);
    setRegisterSuccess(false);
    setCaptchaError(null);
    setAsyncStatus({});
    loginForm.reset();
    registerForm.reset();
    refreshCaptchaFromServer();
  };

  const toggleTheme = () => setTheme(theme === 'light' ? 'dark' : 'light');
  const toggleLanguage = () => {
    const next = language === 'zh' ? 'en' : 'zh';
    setLanguage(next);
    i18n.changeLanguage(next);
  };

  const isLoading = login.isPending || register.isPending;
  const passwordStrength = calcPasswordStrength(regPassword || '');

  if (forgotSubmitted) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-bg dark:bg-zinc-950 px-4">
        <div className="max-w-md w-full text-center p-8 bg-bg dark:bg-zinc-900">
          <MdMarkEmailUnread className="h-16 w-16 mx-auto mb-4 text-primary" aria-hidden="true" />
          <h1 className="text-2xl font-bold font-display tracking-tight text-text-primary dark:text-zinc-100">
            {t('auth.checkEmail')}
          </h1>
          <p className="text-text-secondary dark:text-zinc-400 mt-2">{t('auth.resetLinkSent')}</p>
          <p className="text-[15px] text-text-secondary dark:text-zinc-400 mt-4">
            {t('auth.resetLinkExpiry')}
          </p>
          <button
            onClick={() => {
              setForgotSubmitted(false);
              setShowForgotPassword(false);
            }}
            className="mt-6 inline-flex items-center gap-1 whitespace-nowrap text-primary-700 hover:text-primary-600 dark:text-zinc-400 dark:hover:text-zinc-300 text-[15px]"
          >
            <MdArrowBack className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">{t('auth.backToSignIn')}</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex items-center justify-center bg-bg dark:bg-zinc-950 px-4">
      <a href="#main-content" className="skip-to-main">
        {t('common.skipToMain')}
      </a>
      <main id="main-content">
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

        <div className="max-w-md w-full space-y-6 p-8 bg-bg dark:bg-zinc-900">
          <div className="text-center">
            <img src="/logo.svg" alt={t('common.appName')} className="h-20 w-20 mx-auto" />
          </div>

          {/* ═══ Login Form ═══ */}
          {!showForgotPassword && tab === 'login' && (
            <>
              <h1 className="text-xl font-bold font-display text-center text-text-primary dark:text-zinc-100">
                {t('auth.loginButton')}
              </h1>
              <form onSubmit={loginForm.handleSubmit(onLogin)} className="space-y-4" noValidate>
                {registerSuccess && (
                  <div
                    className="bg-success/10 dark:bg-success/20 text-success dark:text-success p-3 text-[15px]"
                    role="alert"
                  >
                    {t('auth.registerSuccess')}
                  </div>
                )}
                {loginError && (
                  <div
                    className="bg-error/10 dark:bg-error/20 text-error dark:text-error p-3 text-[15px]"
                    role="alert"
                    aria-live="assertive"
                  >
                    {resolveErrorText(loginError, t)}
                  </div>
                )}
                <div>
                  <label
                    htmlFor="identifier"
                    className="block text-[13px] font-medium text-primary-700 dark:text-zinc-300"
                  >
                    {t('auth.identifierLabel')}
                  </label>
                  <Tooltip
                    content={
                      !loginError
                        ? translateZodError(loginForm.formState.errors.identifier?.message, t)
                        : ''
                    }
                    className="block w-full"
                  >
                    <div className="relative">
                      <input
                        id="identifier"
                        type="text"
                        {...loginForm.register('identifier')}
                        onFocus={() => setRegisterSuccess(false)}
                        className={inputCls(!!loginForm.formState.errors.identifier)}
                        placeholder={t('auth.identifierPlaceholder')}
                        autoComplete="username"
                        autoFocus
                      />
                    </div>
                  </Tooltip>
                </div>
                <div>
                  <label
                    htmlFor="password"
                    className="block text-[13px] font-medium text-primary-700 dark:text-zinc-300"
                  >
                    {t('auth.password')}
                  </label>
                  <Tooltip
                    content={
                      !loginError
                        ? translateZodError(loginForm.formState.errors.password?.message, t)
                        : ''
                    }
                    className="block w-full"
                  >
                    <PasswordInput
                      id="password"
                      {...loginForm.register('password')}
                      className={inputCls(!!loginForm.formState.errors.password)}
                      autoComplete="current-password"
                      icon={
                        <FieldStatusIcon
                          status={!loginError && loginForm.formState.errors.password ? 'error' : ''}
                        />
                      }
                    />
                  </Tooltip>
                </div>
                {/* CAPTCHA */}
                <div>
                  <label
                    htmlFor="login-code"
                    className="block text-[13px] font-medium text-primary-700 dark:text-zinc-300"
                  >
                    {t('auth.verificationCode')}
                  </label>
                  <div className="mt-1 flex gap-2 items-center">
                    <Tooltip
                      content={
                        translateZodError(
                          loginForm.formState.errors.captchaAnswer?.message,
                          t
                        ) || resolveErrorText(captchaError, t) ||
                        (captchaStatus === 'error' ? t('auth.captchaIncorrect') : '')
                      }
                      className="relative flex-1"
                    >
                      <input
                        id="login-code"
                        type="text"
                        inputMode="numeric"
                        {...loginForm.register('captchaAnswer', {
                          onChange: () => { if (captchaError) setCaptchaError(null); },
                        })}
                        className={inputCls(
                          !!(
                            loginForm.formState.errors.captchaAnswer ||
                            captchaError
                          )
                        )}
                        placeholder={t('auth.codePlaceholder')}
                        autoComplete="off"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2">
                        <FieldStatusIcon
                          status={
                            captchaError || loginForm.formState.errors.captchaAnswer
                              ? 'error'
                              : captchaStatus !== 'idle'
                                ? captchaStatus
                                : ''
                          }
                        />
                      </span>
                    </Tooltip>
                    <button
                      type="button"
                      onClick={() => {
                        refreshCaptchaFromServer();
                        loginForm.setValue('captchaAnswer', '');
                        setCaptchaError(null);
                      }}
                      className="bg-surface dark:bg-zinc-800 px-3 py-2 rounded-sm text-[15px] font-mono font-bold select-none text-text-primary dark:text-zinc-200 whitespace-nowrap hover:bg-primary-50 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
                      aria-label={t('common.refreshCaptcha')}
                    >
                      {captchaLoading ? '...' : captcha.question}
                    </button>
                  </div>
                  {(loginForm.formState.errors.captchaAnswer || captchaError) && (
                    <p className="text-error text-[13px] mt-1" role="alert">
                      {translateZodError(loginForm.formState.errors.captchaAnswer?.message, t) ||
                        resolveErrorText(captchaError, t)}
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isLoading || !loginForm.formState.isValid}
                  className="w-full py-2.5 px-4 mt-2 bg-primary hover:bg-primary-600 text-white font-medium text-[15px] rounded-sm hover:-translate-y-px hover:shadow-btn-glow transition-all focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/12 disabled:opacity-50"
                >
                  {login.isPending ? t('auth.signingIn') : t('auth.loginButton')}
                </button>
                <button
                  type="button"
                  onClick={switchToForgot}
                  className="w-full text-[15px] text-primary-700 hover:text-primary-600 dark:text-zinc-400 dark:hover:text-zinc-300 transition-colors mt-1"
                >
                  {t('auth.forgotPassword')}
                </button>
                <button
                  type="button"
                  onClick={() => switchTab('register')}
                  className="w-full text-[15px] text-primary-700 hover:text-primary-600 dark:text-zinc-400 dark:hover:text-zinc-300 transition-colors mt-1"
                >
                  {t('auth.noAccount')}
                </button>
              </form>
            </>
          )}

          {/* ═══ Register Form ═══ */}
          {!showForgotPassword && tab === 'register' && (
            <>
              <h1 className="text-xl font-bold font-display text-center text-text-primary dark:text-zinc-100">
                {t('auth.registerButton')}
              </h1>
              <form
                onSubmit={registerForm.handleSubmit(onRegister)}
                className="space-y-4"
                noValidate
              >
                {registerSuccess && (
                  <div
                    className="bg-success/10 dark:bg-success/20 text-success dark:text-success p-3 text-[15px]"
                    role="alert"
                  >
                    {t('auth.registerSuccess')}
                  </div>
                )}
                {registerError && (
                  <div
                    className="bg-error/10 dark:bg-error/20 text-error dark:text-error p-3 text-[15px]"
                    role="alert"
                  >
                    {resolveErrorText(registerError, t)}
                  </div>
                )}

                {/* Username */}
                <div>
                  <label
                    htmlFor="reg-username"
                    className="block text-[13px] font-medium text-primary-700 dark:text-zinc-300"
                  >
                    {t('auth.username')}
                  </label>
                  <Tooltip
                    content={
                      translateZodError(registerForm.formState.errors.username?.message, t) ||
                      (asyncStatus.username === 'invalid' ? t('auth.asyncUsernameTaken') : '')
                    }
                    className="block w-full"
                  >
                    <div className="relative">
                      <input
                        id="reg-username"
                        type="text"
                        {...registerForm.register('username')}
                        onBlur={registerForm.register('username').onBlur}
                        className={inputCls(
                          !!(
                            registerForm.formState.errors.username ||
                            asyncStatus.username === 'invalid'
                          )
                        )}
                        placeholder={t('auth.usernamePlaceholder')}
                        autoComplete="username"
                        autoFocus
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2">
                        <FieldStatusIcon
                          status={
                            asyncStatus.username === 'checking'
                              ? 'checking'
                              : registerForm.formState.errors.username ||
                                  asyncStatus.username === 'invalid'
                                ? 'error'
                                : registerForm.getValues('username')
                                  ? 'success'
                                  : ''
                          }
                        />
                      </span>
                    </div>
                  </Tooltip>
                </div>

                {/* Phone */}
                <div>
                  <label
                    htmlFor="reg-phone"
                    className="block text-[13px] font-medium text-primary-700 dark:text-zinc-300"
                  >
                    {t('auth.phone')}
                  </label>
                  <div className="mt-1 flex gap-2">
                    <label htmlFor="reg-country-code" className="sr-only">
                      {t('auth.phone')}
                    </label>
                    <div className="relative flex-shrink-0">
                      <select
                        id="reg-country-code"
                        {...registerForm.register('countryCode')}
                        className="appearance-none block border border-border dark:border-zinc-700 bg-bg dark:bg-zinc-800 px-3 pr-7 py-2 text-[15px] text-text-primary dark:text-zinc-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
                      >
                        {COUNTRY_CODES.map((cc) => (
                          <option key={cc.code} value={cc.code}>
                            {cc.label}
                          </option>
                        ))}
                      </select>
                      <MdExpandMore className="absolute right-1.5 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral pointer-events-none" />
                    </div>
                    <Tooltip
                      content={
                        translateZodError(registerForm.formState.errors.phone?.message, t) ||
                        (asyncStatus.phone === 'invalid' ? t('auth.asyncPhoneTaken') : '')
                      }
                      className="relative flex-1"
                    >
                      <div className="relative">
                        <input
                          id="reg-phone"
                          type="tel"
                          {...registerForm.register('phone')}
                          onBlur={registerForm.register('phone').onBlur}
                          className={`block w-full rounded-sm border bg-bg dark:bg-zinc-800 px-3 py-2 text-[15px] text-text-primary dark:text-zinc-100 placeholder-text-neutral focus:outline-none focus:ring-2 focus:ring-primary ${
                            registerForm.formState.errors.phone || asyncStatus.phone === 'invalid'
                              ? 'border-error dark:border-error'
                              : 'border-border dark:border-zinc-700 focus:border-primary'
                          }`}
                          placeholder={t('auth.phonePlaceholder')}
                          autoComplete="tel"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2">
                          <FieldStatusIcon
                            status={
                              asyncStatus.phone === 'checking'
                                ? 'checking'
                                : registerForm.formState.errors.phone ||
                                    asyncStatus.phone === 'invalid'
                                  ? 'error'
                                  : registerForm.getValues('phone')
                                    ? 'success'
                                    : ''
                            }
                          />
                        </span>
                      </div>
                    </Tooltip>
                  </div>
                </div>

                {/* Email */}
                <div>
                  <label
                    htmlFor="reg-email"
                    className="block text-[13px] font-medium text-primary-700 dark:text-zinc-300"
                  >
                    {t('auth.email')}
                  </label>
                  <Tooltip
                    content={
                      translateZodError(registerForm.formState.errors.email?.message, t) ||
                      (asyncStatus.email === 'invalid' ? t('auth.asyncEmailTaken') : '')
                    }
                    className="block w-full"
                  >
                    <div className="relative">
                      <input
                        id="reg-email"
                        type="email"
                        {...registerForm.register('email')}
                        onBlur={registerForm.register('email').onBlur}
                        className={inputCls(
                          !!(registerForm.formState.errors.email || asyncStatus.email === 'invalid')
                        )}
                        placeholder={t('auth.emailPlaceholder')}
                        autoComplete="email"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2">
                        <FieldStatusIcon
                          status={
                            asyncStatus.email === 'checking'
                              ? 'checking'
                              : registerForm.formState.errors.email ||
                                  asyncStatus.email === 'invalid'
                                ? 'error'
                                : registerForm.getValues('email')
                                  ? 'success'
                                  : ''
                          }
                        />
                      </span>
                    </div>
                  </Tooltip>
                </div>

                {/* Password */}
                <div>
                  <label
                    htmlFor="reg-password"
                    className="block text-[13px] font-medium text-primary-700 dark:text-zinc-300"
                  >
                    {t('auth.password')}
                  </label>
                  <Tooltip
                    content={
                      registerForm.formState.errors.password && !regPassword ? (
                        translateZodError(registerForm.formState.errors.password.message, t)
                      ) : regPassword && !hidePasswordBubble ? (
                        <div className="space-y-1.5 min-w-48">
                          <div className="flex gap-1">
                            {passwordStrengthLevels.map((level) => (
                              <div
                                key={level}
                                className={`h-1 flex-1 rounded-full ${level < passwordStrength.score ? passwordStrength.color : 'bg-bg/30'}`}
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
                              { met: regPassword.length >= 12, label: t('auth.passwordReqLength') },
                              {
                                met: /[a-zA-Z]/.test(regPassword),
                                label: t('auth.passwordReqLetter'),
                              },
                              { met: /\d/.test(regPassword), label: t('auth.passwordReqDigit') },
                              {
                                met: /[^a-zA-Z0-9]/.test(regPassword),
                                label: t('auth.passwordReqSpecial'),
                              },
                            ].map((req) => (
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
                    variant={
                      registerForm.formState.errors.password && !regPassword ? 'error' : 'info'
                    }
                    className="block w-full"
                  >
                    <PasswordInput
                      id="reg-password"
                      {...registerForm.register('password')}
                      className={inputCls(!!registerForm.formState.errors.password)}
                      placeholder={t('auth.passwordPlaceholder')}
                      autoComplete="new-password"
                      icon={
                        <FieldStatusIcon
                          status={
                            registerForm.formState.errors.password
                              ? 'error'
                              : registerForm.formState.dirtyFields.password && regPassword
                                ? 'success'
                                : ''
                          }
                        />
                      }
                    />
                  </Tooltip>
                </div>

                {/* Confirm Password */}
                <div>
                  <label
                    htmlFor="reg-confirm-password"
                    className="block text-[13px] font-medium text-primary-700 dark:text-zinc-300"
                  >
                    {t('auth.confirmPassword')}
                  </label>
                  <Tooltip
                    content={
                      translateZodError(
                        registerForm.formState.errors.confirmPassword?.message,
                        t
                      ) || (confirmPwdMismatch ? t('auth.validationPasswordMismatch') : '')
                    }
                    className="block w-full"
                  >
                    <PasswordInput
                      id="reg-confirm-password"
                      {...registerForm.register('confirmPassword')}
                      className={inputCls(
                        !!(registerForm.formState.errors.confirmPassword || confirmPwdMismatch)
                      )}
                      autoComplete="new-password"
                      icon={
                        <FieldStatusIcon
                          status={
                            registerForm.formState.errors.confirmPassword || confirmPwdMismatch
                              ? 'error'
                              : confirmPwd && regPassword === confirmPwd
                                ? 'success'
                                : ''
                          }
                        />
                      }
                    />
                  </Tooltip>
                </div>

                {/* CAPTCHA — server-validated */}
                <div>
                  <label
                    htmlFor="reg-code"
                    className="block text-[13px] font-medium text-primary-700 dark:text-zinc-300"
                  >
                    {t('auth.verificationCode')}
                  </label>
                  <div className="mt-1 flex gap-2 items-center">
                    <Tooltip
                      content={
                        translateZodError(
                          registerForm.formState.errors.captchaAnswer?.message,
                          t
                        ) || resolveErrorText(captchaError, t) ||
                        (captchaStatus === 'error' ? t('auth.captchaIncorrect') : '')
                      }
                      className="relative flex-1"
                    >
                      <input
                        id="reg-code"
                        type="text"
                        inputMode="numeric"
                        {...registerForm.register('captchaAnswer', {
                          onChange: () => { if (captchaError) setCaptchaError(null); },
                        })}
                        className={inputCls(
                          !!(
                            registerForm.formState.errors.captchaAnswer ||
                            captchaError
                          )
                        )}
                        placeholder={t('auth.codePlaceholder')}
                        autoComplete="off"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2">
                        <FieldStatusIcon
                          status={
                            captchaError || registerForm.formState.errors.captchaAnswer
                              ? 'error'
                              : captchaStatus !== 'idle'
                                ? captchaStatus
                                : ''
                          }
                        />
                      </span>
                    </Tooltip>
                    <button
                      type="button"
                      onClick={() => {
                        refreshCaptchaFromServer();
                        registerForm.setValue('captchaAnswer', '');
                        setCaptchaError(null);
                      }}
                      className="bg-surface dark:bg-zinc-800 px-3 py-2 rounded-sm text-[15px] font-mono font-bold select-none text-text-primary dark:text-zinc-200 whitespace-nowrap hover:bg-primary-50 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
                      aria-label={t('common.refreshCaptcha')}
                    >
                      {captchaLoading ? '...' : captcha.question}
                    </button>
                  </div>
                  {(registerForm.formState.errors.captchaAnswer || captchaError) && (
                    <p className="text-error text-[13px] mt-1" role="alert">
                      {translateZodError(registerForm.formState.errors.captchaAnswer?.message, t) ||
                        resolveErrorText(captchaError, t)}
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isLoading || !registerForm.formState.isValid}
                  className="w-full py-2.5 px-4 mt-2 bg-primary hover:bg-primary-600 text-white font-medium text-[15px] rounded-sm hover:-translate-y-px hover:shadow-btn-glow transition-all focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/12 disabled:opacity-50"
                >
                  {register.isPending ? t('auth.creatingAccount') : t('auth.registerButton')}
                </button>
                <button
                  type="button"
                  onClick={() => switchTab('login')}
                  className="w-full text-[15px] text-primary-700 hover:text-primary-600 dark:text-zinc-400 dark:hover:text-zinc-300 transition-colors mt-1"
                >
                  {t('auth.hasAccount')}
                </button>
              </form>
            </>
          )}

          {/* ═══ Forgot Password Form ═══ */}
          {showForgotPassword && (
            <form onSubmit={forgotForm.handleSubmit(onForgot)} className="space-y-4" noValidate>
              {forgotError && (
                <div
                  className="bg-error/10 dark:bg-error/20 text-error dark:text-error p-3 text-[15px]"
                  role="alert"
                >
                  {resolveErrorText(forgotError, t)}
                </div>
              )}
              <button
                type="button"
                onClick={switchToLogin}
                className="inline-flex items-center gap-1 whitespace-nowrap text-[15px] text-primary-700 hover:text-primary-600 dark:text-zinc-400 dark:hover:text-zinc-300 transition-colors"
              >
                <MdArrowBack className="h-4 w-4 shrink-0" />
                <span className="hidden sm:inline">{t('auth.backToSignIn')}</span>
              </button>
              <p className="text-[15px] text-text-secondary dark:text-zinc-400">
                {t('auth.forgotPasswordDesc')}
              </p>

              <div>
                <label
                  htmlFor="forgot-email"
                  className="block text-[13px] font-medium text-primary-700 dark:text-zinc-300"
                >
                  {t('auth.email')}
                </label>
                <Tooltip
                  content={translateZodError(forgotForm.formState.errors.email?.message, t)}
                  className="relative block w-full"
                >
                  <input
                    id="forgot-email"
                    type="email"
                    {...forgotForm.register('email')}
                    className={inputCls(!!forgotForm.formState.errors.email)}
                    placeholder={t('auth.emailPlaceholder')}
                    autoComplete="email"
                    autoFocus
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2">
                    <FieldStatusIcon
                      status={
                        forgotForm.formState.errors.email
                          ? 'error'
                          : forgotEmailValue
                            ? 'success'
                            : ''
                      }
                    />
                  </span>
                </Tooltip>
              </div>

              <div>
                <label
                  htmlFor="forgot-code"
                  className="block text-[13px] font-medium text-primary-700 dark:text-zinc-300"
                >
                  {t('auth.verificationCode')}
                </label>
                <div className="mt-1 flex gap-2 items-center">
                  <Tooltip
                    content={
                      translateZodError(forgotForm.formState.errors.captchaAnswer?.message, t) ||
                      resolveErrorText(captchaError, t) ||
                      (captchaStatus === 'error' ? t('auth.captchaIncorrect') : '')
                    }
                    className="relative flex-1"
                  >
                    <input
                      id="forgot-code"
                      type="text"
                      inputMode="numeric"
                      {...forgotForm.register('captchaAnswer', {
                        onChange: () => { if (captchaError) setCaptchaError(null); },
                      })}
                      className={inputCls(
                        !!(forgotForm.formState.errors.captchaAnswer || captchaError)
                      )}
                      placeholder={t('auth.codePlaceholder')}
                      autoComplete="off"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2">
                      <FieldStatusIcon
                        status={
                          captchaError || forgotForm.formState.errors.captchaAnswer
                            ? 'error'
                            : captchaStatus !== 'idle'
                              ? captchaStatus
                              : ''
                        }
                      />
                    </span>
                  </Tooltip>
                  <button
                    type="button"
                    onClick={() => {
                      refreshCaptchaFromServer();
                      forgotForm.setValue('captchaAnswer', '');
                      setCaptchaError(null);
                    }}
                    className="bg-surface dark:bg-zinc-800 px-3 py-2 rounded-sm text-[15px] font-mono font-bold select-none text-text-primary dark:text-zinc-200 whitespace-nowrap hover:bg-primary-50 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
                    aria-label={t('common.refreshCaptcha')}
                  >
                    {captchaLoading ? '...' : captcha.question}
                  </button>
                </div>
                {(forgotForm.formState.errors.captchaAnswer || captchaError) && (
                  <p className="text-error text-[13px] mt-1" role="alert">
                    {translateZodError(forgotForm.formState.errors.captchaAnswer?.message, t) ||
                      resolveErrorText(captchaError, t)}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={!forgotForm.formState.isValid || isForgotSubmitting}
                className="w-full py-2.5 px-4 mt-2 bg-primary hover:bg-primary-600 text-white font-medium text-[15px] rounded-sm hover:-translate-y-px hover:shadow-btn-glow transition-all focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/12 disabled:opacity-50"
              >
                {isForgotSubmitting ? '...' : t('auth.sendResetLink')}
              </button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
