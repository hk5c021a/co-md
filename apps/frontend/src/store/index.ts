import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Theme store
type Theme = 'light' | 'dark' | 'system';

interface ThemeState {
  theme: Theme;
  resolvedTheme: 'light' | 'dark';
  setTheme: (theme: Theme) => void;
}

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'light';
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'light',
      resolvedTheme: 'light' as 'light' | 'dark',
      setTheme: (theme) => {
        const resolved = theme === 'system' ? getSystemTheme() : theme;
        set({ theme, resolvedTheme: resolved });
        document.documentElement.classList.toggle('dark', resolved === 'dark');
      },
    }),
    {
      name: 'theme-storage',
      onRehydrateStorage: () => (state) => {
        if (state) {
          const resolved = state.theme === 'system' ? getSystemTheme() : state.theme;
          state.resolvedTheme = resolved;
          document.documentElement.classList.toggle('dark', resolved === 'dark');
        }
      },
    }
  )
);

// Language store
type Language = 'zh' | 'en';

interface LanguageState {
  language: Language;
  setLanguage: (language: Language) => void;
}

export const useLanguageStore = create<LanguageState>()(
  persist(
    (set) => ({
      language: 'zh',
      setLanguage: (language) => {
        set({ language });
        document.documentElement.lang = language;
      },
    }),
    {
      name: 'language-storage',
      onRehydrateStorage: () => (state) => {
        if (state) document.documentElement.lang = state.language;
      },
    }
  )
);
