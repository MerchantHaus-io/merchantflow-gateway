import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

// Theme variants - base mode + style variant
export type ThemeMode = 'dark' | 'light';
export type ThemeVariant = 
  | 'dark-default' 
  | 'dark-midnight' 
  | 'dark-forest'
  | 'light-default' 
  | 'light-ocean' 
  | 'light-warm';

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
  { id: 'light-default', name: 'Default Light', mode: 'light', description: 'Standard light theme' },
  { id: 'light-ocean', name: 'Ocean', mode: 'light', description: 'Cool blue tones' },
  { id: 'light-warm', name: 'Warm', mode: 'light', description: 'Warm sepia tones' },
];

interface ThemeContextType {
  theme: ThemeMode;
  variant: ThemeVariant;
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

export const ThemeProvider = ({ children }: ThemeProviderProps) => {
  const [theme, setThemeState] = useState<ThemeMode>(getStoredTheme);
  const [variant, setVariantState] = useState<ThemeVariant>(getStoredVariant);

  useEffect(() => {
    // Apply theme class to document root
    const root = document.documentElement;
    
    // Remove all theme classes
    root.classList.remove('dark', 'light', 'dark-default', 'dark-midnight', 'dark-forest', 'light-default', 'light-ocean', 'light-warm');
    
    // Add base mode and variant
    root.classList.add(theme);
    root.classList.add(variant);
    
    persistTheme(theme);
    persistVariant(variant);
  }, [theme, variant]);

  const toggleTheme = () => {
    setThemeState(prev => {
      const newMode = prev === 'dark' ? 'light' : 'dark';
      // Also update variant to match mode
      const defaultVariant = newMode === 'dark' ? 'dark-default' : 'light-default';
      setVariantState(defaultVariant);
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
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, variant, toggleTheme, setTheme, setVariant }}>
      {children}
    </ThemeContext.Provider>
  );
};
