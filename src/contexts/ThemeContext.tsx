import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

// Theme variants - base mode + style variant
export type ThemeMode = 'dark' | 'light';
export type ThemeVariant = 
  | 'dark-default' 
  | 'dark-midnight' 
  | 'dark-forest'
  | 'dark-slate'
  | 'light-default' 
  | 'light-ocean' 
  | 'light-warm'
  | 'light-slate';

export interface ThemeOption {
  id: ThemeVariant;
  name: string;
  mode: ThemeMode;
  description: string;
}

export const THEME_OPTIONS: ThemeOption[] = [
  { id: 'dark-default', name: 'Default Dark', mode: 'dark', description: 'Standard dark theme' },
  { id: 'dark-midnight', name: 'Midnight', mode: 'dark', description: 'Deep blue tones' },
  { id: 'dark-forest', name: 'Forest', mode: 'dark', description: 'Dark green accents' },
  { id: 'dark-slate', name: 'Slate', mode: 'dark', description: 'Cool grey tones' },
  { id: 'light-default', name: 'Default Light', mode: 'light', description: 'Standard light theme' },
  { id: 'light-ocean', name: 'Ocean', mode: 'light', description: 'Cool blue tones' },
  { id: 'light-warm', name: 'Warm', mode: 'light', description: 'Warm sepia tones' },
  { id: 'light-slate', name: 'Slate', mode: 'light', description: 'Neutral grey tones' },
];

interface ThemeContextType {
  theme: ThemeMode;
  variant: ThemeVariant;
  defaultDarkVariant: ThemeVariant;
  defaultLightVariant: ThemeVariant;
  toggleTheme: () => void;
  setTheme: (theme: ThemeMode) => void;
  setVariant: (variant: ThemeVariant) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

interface ThemeProviderProps {
  children: ReactNode;
}

const STORAGE_KEY = 'merchantflow-theme';
const VARIANT_STORAGE_KEY = 'merchantflow-theme-variant';
const DEFAULT_DARK_KEY = 'merchantflow-default-dark';
const DEFAULT_LIGHT_KEY = 'merchantflow-default-light';

const getStoredTheme = (): ThemeMode => {
  try {
    const savedTheme = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
    if (savedTheme === 'light' || savedTheme === 'dark') {
      return savedTheme;
    }
  } catch (error) {
    console.warn('Theme preference unavailable, falling back to dark mode.', error);
  }
  return 'dark';
};

const getStoredVariant = (): ThemeVariant => {
  try {
    const savedVariant = localStorage.getItem(VARIANT_STORAGE_KEY) as ThemeVariant | null;
    if (savedVariant && THEME_OPTIONS.some(opt => opt.id === savedVariant)) {
      return savedVariant;
    }
  } catch (error) {
    console.warn('Theme variant unavailable, falling back to default.', error);
  }
  return 'dark-default';
};

const getStoredDefaultDark = (): ThemeVariant => {
  try {
    const saved = localStorage.getItem(DEFAULT_DARK_KEY) as ThemeVariant | null;
    if (saved && THEME_OPTIONS.some(opt => opt.id === saved && opt.mode === 'dark')) {
      return saved;
    }
  } catch (error) {
    console.warn('Default dark theme unavailable.', error);
  }
  return 'dark-default';
};

const getStoredDefaultLight = (): ThemeVariant => {
  try {
    const saved = localStorage.getItem(DEFAULT_LIGHT_KEY) as ThemeVariant | null;
    if (saved && THEME_OPTIONS.some(opt => opt.id === saved && opt.mode === 'light')) {
      return saved;
    }
  } catch (error) {
    console.warn('Default light theme unavailable.', error);
  }
  return 'light-default';
};

const persistTheme = (theme: ThemeMode) => {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch (error) {
    console.warn('Unable to persist theme preference.', error);
  }
};

const persistVariant = (variant: ThemeVariant) => {
  try {
    localStorage.setItem(VARIANT_STORAGE_KEY, variant);
  } catch (error) {
    console.warn('Unable to persist theme variant.', error);
  }
};

const persistDefaultDark = (variant: ThemeVariant) => {
  try {
    localStorage.setItem(DEFAULT_DARK_KEY, variant);
  } catch (error) {
    console.warn('Unable to persist default dark theme.', error);
  }
};

const persistDefaultLight = (variant: ThemeVariant) => {
  try {
    localStorage.setItem(DEFAULT_LIGHT_KEY, variant);
  } catch (error) {
    console.warn('Unable to persist default light theme.', error);
  }
};

export const ThemeProvider = ({ children }: ThemeProviderProps) => {
  const [theme, setThemeState] = useState<ThemeMode>(getStoredTheme);
  const [variant, setVariantState] = useState<ThemeVariant>(getStoredVariant);
  const [defaultDarkVariant, setDefaultDarkVariant] = useState<ThemeVariant>(getStoredDefaultDark);
  const [defaultLightVariant, setDefaultLightVariant] = useState<ThemeVariant>(getStoredDefaultLight);

  useEffect(() => {
    // Apply theme class to document root
    const root = document.documentElement;
    
    // Remove all theme classes
    root.classList.remove('dark', 'light', 'dark-default', 'dark-midnight', 'dark-forest', 'dark-slate', 'light-default', 'light-ocean', 'light-warm', 'light-slate');
    
    // Add base mode and variant
    root.classList.add(theme);
    root.classList.add(variant);
    
    persistTheme(theme);
    persistVariant(variant);
  }, [theme, variant]);

  const toggleTheme = () => {
    setThemeState(prev => {
      const newMode = prev === 'dark' ? 'light' : 'dark';
      // Switch to the user's saved default for that mode
      const newVariant = newMode === 'dark' ? defaultDarkVariant : defaultLightVariant;
      setVariantState(newVariant);
      return newMode;
    });
  };

  const setTheme = (newTheme: ThemeMode) => {
    setThemeState(newTheme);
  };

  const setVariant = (newVariant: ThemeVariant) => {
    const option = THEME_OPTIONS.find(opt => opt.id === newVariant);
    if (option) {
      setThemeState(option.mode);
      setVariantState(newVariant);
      
      // Save as the new default for this mode
      if (option.mode === 'dark') {
        setDefaultDarkVariant(newVariant);
        persistDefaultDark(newVariant);
      } else {
        setDefaultLightVariant(newVariant);
        persistDefaultLight(newVariant);
      }
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, variant, defaultDarkVariant, defaultLightVariant, toggleTheme, setTheme, setVariant }}>
      {children}
    </ThemeContext.Provider>
  );
};
