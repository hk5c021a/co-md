import { useState, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { MdCheck, MdClose } from 'react-icons/md';
import { useUser, useUpdateProfile, useChangePassword, useVerifyPassword } from '../../hooks/useApi';
import { preHashPassword } from '../../lib/crypto';
import { API_BASE } from '../../lib/apiClient';

import { tokenStore } from '../../lib/tokenStore';
import { useThemeStore, useLanguageStore } from '../../store/index';
import {
  profileSchema,
  changePasswordSchema,
  translateZodError,
  calcPasswordStrength,
  inputCls,
  type ProfileFormValues,
  type ChangePasswordFormValues,
} from '../../lib/validation';
import { PasswordInput } from '../ui/password-input';
import { Tooltip } from '../ui/tooltip';
import { FieldStatusIcon } from '../ui/field-status-icon';
import { useToast } from '../ui/toast';
import { Button } from '../ui/button';
import { Spinner } from '../ui/spinner';

export function SettingsTab() {
  const { t, i18n } = useTranslation();
  const { data: user, isLoading: userLoading } = useUser();
  // Password change navigates directly to login — logout() is not called here
  // to avoid React re-render → React Query 401 → spurious "session expired" toast.
  const updateProfile = useUpdateProfile();
  const changePassword = useChangePassword();
  const verifyPassword = useVerifyPassword();
  const { theme, setTheme } = useThemeStore();
  const { language, setLanguage } = useLanguageStore();
  const { addToast } = useToast();

  const profileForm = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { username: '', email: '', phone: '' },
    mode: 'onTouched',
  });
  const {
    register: registerProfile,
    handleSubmit: handleProfileSubmit,
    formState: { errors: profileErrors },
    reset: resetProfile,
  } = profileForm;
  const passwordForm = useForm<ChangePasswordFormValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmNewPassword: '' },
    mode: 'onChange',
  });
  const {
    register: registerPassword,
    handleSubmit: handlePasswordSubmit,
    formState: { errors: passwordErrors, dirtyFields: pwdDirty },
    reset: resetPassword,
    trigger: triggerPwdValidation,
    setError: setPwdError,
    clearErrors: clearPwdErrors,
  } = passwordForm;
  const currentPasswordValue = passwordForm.watch('currentPassword');
  const newPasswordValue = passwordForm.watch('newPassword');
  const confirmNewPwd = passwordForm.watch('confirmNewPassword');
  const confirmPwdMismatch = confirmNewPwd && confirmNewPwd !== newPasswordValue;
  const newPwdStrength = calcPasswordStrength(newPasswordValue || '');

  // ── Async current-password verification (debounced) ──
  const [currentPwdStatus, setCurrentPwdStatus] = useState<'idle' | 'checking' | 'valid' | 'invalid'>('idle');
  const pwdVerifyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userSaltRef = useRef<string | null>(null);

  // Fetch the user's PBKDF2 salt once when the user data loads
  useEffect(() => {
    if (!user?.email && !user?.username) return;
    const identifier = encodeURIComponent(user.email || user.username || '');
    fetch(`${API_BASE}/api/auth/salt?identifier=${identifier}`)
      .then((r) => r.json())
      .then((d) => { if (d?.data?.salt) userSaltRef.current = d.data.salt; })
      .catch(() => { /* keep legacy fallback */ });
  }, [user?.email, user?.username]);

  useEffect(() => {
    if (!currentPasswordValue || currentPasswordValue.length < 12) {
      setCurrentPwdStatus('idle');
      return;
    }
    if (pwdVerifyTimer.current) clearTimeout(pwdVerifyTimer.current);
    setCurrentPwdStatus('checking');
    pwdVerifyTimer.current = setTimeout(async () => {
      try {
        const salt = userSaltRef.current || 'co-md-pbkdf2-salt-v1';
        const hash = await preHashPassword(currentPasswordValue, salt);
        const valid = await verifyPassword.mutateAsync(hash);
        setCurrentPwdStatus(valid ? 'valid' : 'invalid');
        if (!valid) {
          setPwdError('currentPassword', { type: 'manual', message: t('auth.invalidPassword') });
        } else {
          clearPwdErrors('currentPassword');
        }
      } catch {
        setCurrentPwdStatus('idle');
      }
    }, 600);
    return () => {
      if (pwdVerifyTimer.current) clearTimeout(pwdVerifyTimer.current);
    };
  }, [currentPasswordValue]);  // eslint-disable-line react-hooks/exhaustive-deps

  // When currentPassword changes, re-trigger the newPassword refinement
  // (so "new must differ from current" re-evaluates)
  useEffect(() => {
    if (newPasswordValue) {
      triggerPwdValidation('newPassword');
    }
  }, [currentPasswordValue, newPasswordValue, triggerPwdValidation]);

  // Password strength bubble auto-hide (matches register form behavior)
  const [hidePwdBubble, setHidePwdBubble] = useState(false);
  const pwdBubbleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const passwordReqsAllMet =
    newPasswordValue &&
    newPasswordValue.length >= 12 &&
    /[a-zA-Z]/.test(newPasswordValue) &&
    /\d/.test(newPasswordValue) &&
    /[^a-zA-Z0-9]/.test(newPasswordValue);

  useEffect(() => {
    if (passwordReqsAllMet) {
      pwdBubbleTimer.current = setTimeout(() => setHidePwdBubble(true), 2000);
    } else {
      if (pwdBubbleTimer.current) clearTimeout(pwdBubbleTimer.current);
      setHidePwdBubble(false);
    }
    return () => {
      if (pwdBubbleTimer.current) clearTimeout(pwdBubbleTimer.current);
    };
  }, [passwordReqsAllMet]);

  useEffect(() => {
    if (newPasswordValue && confirmNewPwd) {
      if (newPasswordValue === confirmNewPwd) {
        passwordForm.clearErrors('confirmNewPassword');
      } else {
        passwordForm.setError('confirmNewPassword', {
          type: 'manual',
          message: t('auth.passwordMismatch'),
        });
      }
    }
  }, [newPasswordValue, confirmNewPwd, t, passwordForm]);

  useEffect(() => {
    if (user) {
      resetProfile({ username: user.username, email: user.email, phone: user.phone || '' });
    }
  }, [user, resetProfile]);

  const onProfileSubmit = async (data: ProfileFormValues) => {
    try {
      await updateProfile.mutateAsync(data);
      addToast(t('home.profileSaved'), 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : t('home.profileSaveFailed'), 'error');
    }
  };

  const onPasswordSubmit = async (data: ChangePasswordFormValues) => {
    try {
      await changePassword.mutateAsync({
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
        identifier: user?.email || user?.username || '',
      });
      // Password changed successfully:
      // 1. Show a green success toast so the user sees confirmation.
      // 2. Set a sessionStorage guard so apiClient does NOT dispatch
      //    "auth:session-expired" for any stray 401s during navigation.
      // 3. Clear old tokens + key material (Worker uses old pbkdf2Salt, now invalid).
      // 4. Navigate after a short delay so the toast is visible.
      addToast(t('auth.passwordChangedLogin'), 'success');
      resetPassword();
      sessionStorage.setItem('co_md_skip_expired', '1');
      await tokenStore.clearAll();
      setTimeout(() => {
        window.location.href = '/login';
      }, 1500);
    } catch (err) {
      addToast(err instanceof Error ? err.message : t('home.passwordChangeFailed'), 'error');
    }
  };

  if (userLoading) {
    return (
      <div className="max-w-2xl mx-auto flex items-center justify-center py-20">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Profile Information */}
      <div className="bg-bg dark:bg-zinc-900 shadow p-6">
        <h2 className="text-lg font-semibold text-text-primary dark:text-zinc-100 mb-4">
          {t('home.profileInfo')}
        </h2>
        <form onSubmit={handleProfileSubmit(onProfileSubmit)} className="space-y-4">
          <div>
            <label
              htmlFor="settings-username"
              className="block text-sm font-medium text-primary-700 dark:text-zinc-300"
            >
              {t('auth.username')}
            </label>
            <Tooltip
              content={translateZodError(profileErrors.username?.message, t)}
              className="relative block w-full"
            >
              <input
                id="settings-username"
                type="text"
                {...registerProfile('username')}
                className="mt-1 block w-full border border-border dark:border-zinc-700 bg-bg dark:bg-zinc-800 px-3 py-2 text-sm text-text-primary dark:text-zinc-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
                autoFocus
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2">
                <FieldStatusIcon status={profileErrors.username ? 'error' : ''} />
              </span>
            </Tooltip>
          </div>
          <div>
            <label
              htmlFor="settings-email"
              className="block text-sm font-medium text-primary-700 dark:text-zinc-300"
            >
              {t('auth.email')}
            </label>
            <Tooltip
              content={translateZodError(profileErrors.email?.message, t)}
              className="relative block w-full"
            >
              <input
                id="settings-email"
                type="email"
                {...registerProfile('email')}
                className="mt-1 block w-full border border-border dark:border-zinc-700 bg-bg dark:bg-zinc-800 px-3 py-2 text-sm text-text-primary dark:text-zinc-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2">
                <FieldStatusIcon status={profileErrors.email ? 'error' : ''} />
              </span>
            </Tooltip>
          </div>
          <div>
            <label
              htmlFor="settings-phone"
              className="block text-sm font-medium text-primary-700 dark:text-zinc-300"
            >
              {t('auth.phone')}
            </label>
            <Tooltip
              content={translateZodError(profileErrors.phone?.message, t)}
              className="relative block w-full"
            >
              <input
                id="settings-phone"
                type="tel"
                {...registerProfile('phone')}
                className="mt-1 block w-full border border-border dark:border-zinc-700 bg-bg dark:bg-zinc-800 px-3 py-2 text-sm text-text-primary dark:text-zinc-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2">
                <FieldStatusIcon status={profileErrors.phone ? 'error' : ''} />
              </span>
            </Tooltip>
          </div>
          <Button type="submit" disabled={updateProfile.isPending} className="w-full mt-2">
            {updateProfile.isPending ? t('home.saving') : t('home.saveProfile')}
          </Button>
        </form>
      </div>

      {/* Change Password */}
      <div className="bg-bg dark:bg-zinc-900 shadow p-6">
        <h2 className="text-lg font-semibold text-text-primary dark:text-zinc-100 mb-4">
          {t('home.changePassword')}
        </h2>
        <form onSubmit={handlePasswordSubmit(onPasswordSubmit)} className="space-y-4" noValidate>
          {/* Current Password — async server-side verification */}
          <div>
            <label
              htmlFor="settings-current-password"
              className="block text-[13px] font-medium text-primary-700 dark:text-zinc-300"
            >
              {t('home.currentPassword')}
            </label>
            <Tooltip
              content={translateZodError(passwordErrors.currentPassword?.message, t)}
              className="block w-full"
            >
              <PasswordInput
                id="settings-current-password"
                {...registerPassword('currentPassword')}
                className={inputCls(
                  !!(passwordErrors.currentPassword || currentPwdStatus === 'invalid')
                )}
                placeholder={t('auth.passwordPlaceholder')}
                autoComplete="current-password"
                autoFocus
                icon={
                  <FieldStatusIcon
                    status={
                      currentPwdStatus === 'checking'
                        ? 'checking'
                        : passwordErrors.currentPassword || currentPwdStatus === 'invalid'
                          ? 'error'
                          : currentPwdStatus === 'valid'
                            ? 'success'
                            : ''
                    }
                  />
                }
              />
            </Tooltip>
          </div>

          {/* New Password — matches register form: strength bubble + requirements */}
          <div>
            <label
              htmlFor="settings-new-password"
              className="block text-[13px] font-medium text-primary-700 dark:text-zinc-300"
            >
              {t('home.newPassword')}
            </label>
            <Tooltip
              content={
                passwordErrors.newPassword ? (
                  translateZodError(passwordErrors.newPassword.message, t)
                ) : newPasswordValue && !hidePwdBubble ? (
                  <div className="space-y-1.5 min-w-48">
                    <div className="flex gap-1">
                      {[0, 1, 2, 3].map((level) => (
                        <div
                          key={level}
                          className={`h-1 flex-1 rounded-full ${level < newPwdStrength.score ? newPwdStrength.color : 'bg-bg/30'}`}
                        />
                      ))}
                    </div>
                    <p className="opacity-90">
                      {t('auth.passwordStrength')}:{' '}
                      {newPwdStrength.score <= 1
                        ? t('auth.passwordStrengthWeak')
                        : newPwdStrength.score === 2
                          ? t('auth.passwordStrengthFair')
                          : newPwdStrength.score === 3
                            ? t('auth.passwordStrengthGood')
                            : t('auth.passwordStrengthStrong')}
                    </p>
                    <div className="space-y-0.5 pt-1.5 border-t border-border/30 dark:border-white/20">
                      {[
                        { met: newPasswordValue.length >= 12, label: t('auth.passwordReqLength') },
                        { met: /[a-zA-Z]/.test(newPasswordValue), label: t('auth.passwordReqLetter') },
                        { met: /\d/.test(newPasswordValue), label: t('auth.passwordReqDigit') },
                        { met: /[^a-zA-Z0-9]/.test(newPasswordValue), label: t('auth.passwordReqSpecial') },
                      ].map((req, i) => (
                        <p
                          key={i}
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
                passwordErrors.newPassword ? 'error' : 'info'
              }
              className="block w-full"
            >
              <PasswordInput
                id="settings-new-password"
                {...registerPassword('newPassword')}
                className={inputCls(!!passwordErrors.newPassword)}
                placeholder={t('auth.passwordPlaceholder')}
                autoComplete="new-password"
                icon={
                  <FieldStatusIcon
                    status={
                      passwordErrors.newPassword
                        ? 'error'
                        : pwdDirty.newPassword && newPasswordValue
                          ? 'success'
                          : ''
                    }
                  />
                }
              />
            </Tooltip>
          </div>

          {/* Confirm New Password — matches register form */}
          <div>
            <label
              htmlFor="settings-confirm-password"
              className="block text-[13px] font-medium text-primary-700 dark:text-zinc-300"
            >
              {t('home.confirmNewPassword')}
            </label>
            <Tooltip
              content={
                translateZodError(passwordErrors.confirmNewPassword?.message, t) ||
                (confirmPwdMismatch ? t('auth.validationPasswordMismatch') : '')
              }
              className="block w-full"
            >
              <PasswordInput
                id="settings-confirm-password"
                {...registerPassword('confirmNewPassword')}
                className={inputCls(
                  !!(passwordErrors.confirmNewPassword || confirmPwdMismatch)
                )}
                placeholder={t('auth.passwordPlaceholder')}
                autoComplete="new-password"
                icon={
                  <FieldStatusIcon
                    status={
                      passwordErrors.confirmNewPassword || confirmPwdMismatch
                        ? 'error'
                        : confirmNewPwd && newPasswordValue === confirmNewPwd
                          ? 'success'
                          : ''
                    }
                  />
                }
              />
            </Tooltip>
          </div>

          <Button type="submit" disabled={changePassword.isPending} className="w-full mt-2">
            {changePassword.isPending ? t('home.changing') : t('home.changePasswordButton')}
          </Button>
        </form>
      </div>

      {/* Preferences */}
      <div className="bg-bg dark:bg-zinc-900 shadow p-6">
        <h2 className="text-lg font-semibold text-text-primary dark:text-zinc-100 mb-4">
          {t('home.preferences')}
        </h2>
        <div className="space-y-6">
          <fieldset>
            <legend className="block text-sm font-medium text-primary-700 dark:text-zinc-300 mb-3">
              {t('home.theme')}
            </legend>
            <div className="flex gap-2">
              {(['light', 'dark', 'system'] as const).map((tKey) => (
                <button
                  key={tKey}
                  onClick={() => setTheme(tKey)}
                  className={`px-4 py-2 border text-sm font-medium transition-colors ${
                    theme === tKey
                      ? 'bg-primary-50 dark:bg-zinc-950/30 border-primary text-primary-700 dark:text-zinc-300'
                      : 'bg-bg dark:bg-zinc-800 border-border dark:border-zinc-700 text-primary-700 dark:text-zinc-300 hover:bg-surface dark:hover:bg-primary-600'
                  }`}
                >
                  {tKey === 'light'
                    ? t('home.light')
                    : tKey === 'dark'
                      ? t('home.dark')
                      : t('home.system')}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="block text-sm font-medium text-primary-700 dark:text-zinc-300 mb-3">
              {t('home.language')}
            </legend>
            <div className="flex gap-2">
              {(['zh', 'en'] as const).map((lKey) => (
                <button
                  key={lKey}
                  onClick={() => {
                    setLanguage(lKey);
                    i18n.changeLanguage(lKey);
                  }}
                  className={`px-4 py-2 border text-sm font-medium transition-colors ${
                    language === lKey
                      ? 'bg-primary-50 dark:bg-zinc-950/30 border-primary text-primary-700 dark:text-zinc-300'
                      : 'bg-bg dark:bg-zinc-800 border-border dark:border-zinc-700 text-primary-700 dark:text-zinc-300 hover:bg-surface dark:hover:bg-primary-600'
                  }`}
                >
                  {lKey === 'zh' ? t('home.chinese') : t('home.english')}
                </button>
              ))}
            </div>
          </fieldset>
        </div>
      </div>
    </div>
  );
}
