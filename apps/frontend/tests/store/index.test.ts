import { describe, it, expect, beforeEach } from 'vitest';
import { useThemeStore, useLanguageStore } from '../../src/store/index';

describe('useThemeStore', () => {
  beforeEach(() => {
    // Reset the store to initial state
    useThemeStore.setState({ theme: 'light', resolvedTheme: 'light' });
  });

  it('initializes with light theme', () => {
    const state = useThemeStore.getState();
    expect(state.theme).toBe('light');
    expect(state.resolvedTheme).toBe('light');
  });

  it('setTheme updates theme to dark', () => {
    useThemeStore.getState().setTheme('dark');
    const state = useThemeStore.getState();
    expect(state.theme).toBe('dark');
    expect(state.resolvedTheme).toBe('dark');
  });

  it('setTheme("system") resolves to light when system prefers light', () => {
    // window.matchMedia is mocked for jsdom — default is light
    useThemeStore.getState().setTheme('system');
    const state = useThemeStore.getState();
    expect(state.theme).toBe('system');
    expect(state.resolvedTheme).toBe('light');
  });
});

describe('useLanguageStore', () => {
  beforeEach(() => {
    useLanguageStore.setState({ language: 'zh' });
  });

  it('initializes with zh language', () => {
    const state = useLanguageStore.getState();
    expect(state.language).toBe('zh');
  });

  it('setLanguage updates to en', () => {
    useLanguageStore.getState().setLanguage('en');
    const state = useLanguageStore.getState();
    expect(state.language).toBe('en');
  });
});
