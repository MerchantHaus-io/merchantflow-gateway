import type { Config } from "tailwindcss";
import animatePlugin from "tailwindcss-animate";
import { NAV_BREAKPOINT } from "./src/lib/breakpoints";

/*
 * This configuration extends the default Tailwind settings used in the
 * MerchantFlow Gateway application.  The goal of these changes is to
 * improve the overall user experience by adding more breathing room to
 * layouts out‑of‑the‑box.  The container padding has been increased
 * slightly so that content isn’t pressed up against the edges of the
 * viewport, which should make pages feel less cramped on large
 * displays.  All other settings are pulled directly from the existing
 * configuration to maintain the project’s existing colour palette and
 * animation options.
 */

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      // Use moderate padding - 2rem on desktop, 1rem on mobile
      padding: {
        DEFAULT: '1rem',
        sm: '1.5rem',
        lg: '2rem',
      },
      screens: {
        '2xl': '1400px'
      }
    },
    screens: {
      'xs': '475px',
      'sm': '640px',
      'md': '768px',
      // Imported, not literal: the chrome gates the icon rail and tab bar on
      // `lg:` in CSS and on useIsCompactNav() in JS, and those two must be the
      // same number or the 768–1023px band loses both (#134).
      'lg': `${NAV_BREAKPOINT}px`,
      'xl': '1280px',
      '2xl': '1536px',
      // Mobile landscape: narrow height + landscape orientation (targets phones rotated, not desktop)
      'mobile-landscape': { 'raw': '(orientation: landscape) and (max-height: 500px)' },
      // Keep legacy 'landscape' for backwards compatibility but prefer mobile-landscape
      'landscape': { 'raw': '(orientation: landscape) and (max-height: 500px)' },
    },
    extend: {
      fontFamily: {
        // Brand guide: DM Sans for UI, Space Mono for display/mono (#85).
        // Driven from the CSS tokens so a theme can override them.
        display: ['var(--font-display)'],
        mono: ['var(--font-display)'],
        serif: ['var(--font-serif)'],
        sans: [
          'DM Sans',
          'ui-sans-serif',
          'system-ui',
          'sans-serif',
          'Apple Color Emoji',
          'Segoe UI Emoji',
          'Segoe UI Symbol',
          'Noto Color Emoji'
        ],
        display: [
          'Syne',
          'General Sans',
          'Geist',
          'ui-sans-serif',
          'system-ui',
          'sans-serif'
        ],
        'mono-dm': [
          'DM Mono',
          'ui-monospace',
          'SFMono-Regular',
          'monospace'
        ],
        serif: [
          'Playfair Display',
          'ui-serif',
          'Georgia',
          'Cambria',
          'Times New Roman',
          'Times',
          'serif'
        ],
        mono: [
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Monaco',
          'Consolas',
          'Liberation Mono',
          'Courier New',
          'monospace'
        ]
      },
      letterSpacing: {
        'tightest': '-0.04em',
        'tighter': '-0.02em',
        'tight': '-0.01em',
        'normal': '0',
        'wide': '0.02em',
        'wider': '0.04em',
        'widest': '0.08em',
        'caps': '0.12em'
      },
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))'
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))'
        },
        teal: {
          DEFAULT: 'hsl(var(--teal))',
          foreground: 'hsl(var(--teal-foreground))'
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          // Lighter variant for text/icons on dark surfaces — the DEFAULT is
          // too dark to meet AA as body text in the dark themes (#90).
          // Falls back to DEFAULT in themes that don't define it.
          text: 'hsl(var(--destructive-text, var(--destructive)))',
          foreground: 'hsl(var(--destructive-foreground))'
        },
        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))'
        },
        warning: {
          DEFAULT: 'hsl(var(--warning))',
          foreground: 'hsl(var(--warning-foreground))'
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))'
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))'
        },
        info: {
          DEFAULT: 'hsl(var(--info, 213 94% 56%))',
          foreground: 'hsl(var(--info-foreground, 213 94% 15%))'
        },
        // Count badges on nav surfaces. One token instead of four hardcoded
        // #c81030 literals (#129).
        'badge-alert': 'hsl(var(--badge-alert, 350 85% 42%))',
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))'
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))'
        },
        sidebar: {
          DEFAULT: 'hsl(var(--sidebar-background))',
          foreground: 'hsl(var(--sidebar-foreground))',
          primary: 'hsl(var(--sidebar-primary))',
          'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
          accent: 'hsl(var(--sidebar-accent))',
          'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
          border: 'hsl(var(--sidebar-border))',
          ring: 'hsl(var(--sidebar-ring))'
        },
        stage: {
          lead: 'hsl(var(--stage-lead))',
          contacted: 'hsl(var(--stage-contacted))',
          application: 'hsl(var(--stage-application))',
          underwriting: 'hsl(var(--stage-underwriting))',
          approval: 'hsl(var(--stage-approval))',
          live: 'hsl(var(--stage-live))',
          declined: 'hsl(var(--stage-declined))'
        },
        team: {
          root: 'hsl(var(--team-root))',
          jamie: 'hsl(var(--team-jamie))',
          darryn: 'hsl(var(--team-darryn))',
          taryn: 'hsl(var(--team-taryn))',
          yaseen: 'hsl(var(--team-yaseen))',
          sales: 'hsl(var(--team-sales))'
        },
        gold: {
          DEFAULT: 'hsl(var(--gold))',
          foreground: 'hsl(var(--gold-foreground))'
        },
        haus: {
          charcoal: 'hsl(var(--haus-charcoal))',
          bone: 'hsl(var(--bone-white))',
          canvas: 'hsl(var(--canvas-border))'
        },
        // Legacy merchant colors - now using HSL for consistency
        merchant: {
          black: 'hsl(0 0% 6%)',
          dark: 'hsl(0 0% 10%)',
          red: 'hsl(0 100% 27%)',
          redLight: 'hsl(0 84% 50%)',
          gray: 'hsl(0 0% 18%)',
          text: 'hsl(0 0% 90%)',
          blue: 'hsl(217 91% 60%)',
          blueDark: 'hsl(224 76% 33%)'
        }
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)'
      },
      boxShadow: {
        'glow-sm':  '0 0 10px hsl(var(--primary)/0.2)',
        'glow':     '0 0 20px hsl(var(--primary)/0.3)',
        'glow-lg':  '0 0 40px hsl(var(--primary)/0.4), 0 0 80px hsl(var(--primary)/0.15)',
        'card':     '0 4px 16px -4px hsl(var(--background)/0.6), inset 0 1px 0 hsl(var(--foreground)/0.04)',
        'card-hover':'0 12px 32px -8px hsl(var(--primary)/0.2), inset 0 1px 0 hsl(var(--foreground)/0.06)',
      },
      backdropBlur: {
        xs: '2px',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' }
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' }
        },
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        },
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        },
        'fade-out': {
          '0%': { opacity: '1', transform: 'translateY(0)' },
          '100%': { opacity: '0', transform: 'translateY(8px)' }
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' }
        },
        'slide-in-left': {
          '0%': { opacity: '0', transform: 'translateX(-12px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' }
        },
        'slide-in-right': {
          '0%': { opacity: '0', transform: 'translateX(16px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' }
        },
        'ribbon-drop': {
          '0%': { opacity: '0', transform: 'translateY(-40px) scale(0.7)' },
          '50%': { opacity: '1', transform: 'translateY(8px) scale(1.05)' },
          '70%': { transform: 'translateY(-4px) scale(0.98)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' }
        },
        'ironman-hover': {
          '0%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-15px)' },
          '100%': { transform: 'translateY(0px)' }
        },
        'background-drift': {
          '0%': { transform: 'translate(0px, 0px) scale(var(--depth-scale, 0.8))' },
          '33%': { transform: 'translate(40px, -60px) scale(var(--depth-scale, 0.8))' },
          '66%': { transform: 'translate(-50px, 40px) scale(var(--depth-scale, 0.8))' },
          '100%': { transform: 'translate(0px, 0px) scale(var(--depth-scale, 0.8))' }
        },
        'shimmer': {
          '0%': { 'background-position': '-200% center' },
          '100%': { 'background-position': '200% center' }
        },
        'pulse-glow': {
          '0%, 100%': { 'box-shadow': '0 0 8px hsl(var(--primary)/0.3)' },
          '50%': { 'box-shadow': '0 0 20px hsl(var(--primary)/0.6), 0 0 40px hsl(var(--primary)/0.2)' }
        },
        'count-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' }
        },
        'gradient-shift': {
          '0%': { 'background-position': '0% 50%' },
          '50%': { 'background-position': '100% 50%' },
          '100%': { 'background-position': '0% 50%' }
        },
        'grid-drift': {
          '0%': { 'background-position': '0 0' },
          '100%': { 'background-position': '48px 48px' }
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'fade-in': 'fade-in 0.35s ease-out both',
        'fade-in-up': 'fade-in-up 0.4s ease-out both',
        'fade-out': 'fade-out 0.25s ease-out both',
        'scale-in': 'scale-in 0.25s ease-out both',
        'slide-in-left': 'slide-in-left 0.3s ease-out both',
        'slide-in-right': 'slide-in-right 0.3s ease-out both',
        'ribbon-drop': 'ribbon-drop 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
        'ironman-hover': 'ironman-hover 4s ease-in-out infinite',
        'background-drift': 'background-drift 25s ease-in-out infinite',
        'shimmer': 'shimmer 1.5s linear infinite',
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        'count-up': 'count-up 0.5s cubic-bezier(0.34,1.56,0.64,1) both',
        'gradient-shift': 'gradient-shift 4s ease infinite',
        'grid-drift': 'grid-drift 60s linear infinite',
      }
    }
  },
  plugins: [animatePlugin],
} satisfies Config;