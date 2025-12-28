import type { Config } from "tailwindcss";
import animatePlugin from "tailwindcss-animate";

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
      // Increase default padding from 2rem to 3rem to allow content to breathe
      padding: '3rem',
      screens: {
        '2xl': '1400px'
      }
    },
    screens: {
      'xs': '475px',
      'sm': '640px',
      'md': '768px',
      'lg': '1024px',
      'xl': '1280px',
      '2xl': '1536px',
      // Landscape mobile: narrow height + wider than tall
      'landscape': { 'raw': '(orientation: landscape) and (max-height: 500px)' },
    },
    extend: {
      fontFamily: {
        sans: [
          'Geist',
          'ui-sans-serif',
          'system-ui',
          'sans-serif',
          'Apple Color Emoji',
          'Segoe UI Emoji',
          'Segoe UI Symbol',
          'Noto Color Emoji'
        ],
        display: [
          'General Sans',
          'Geist',
          'ui-sans-serif',
          'system-ui',
          'sans-serif'
        ],
        serif: [
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
          wesley: 'hsl(var(--team-wesley))',
          jamie: 'hsl(var(--team-jamie))',
          darryn: 'hsl(var(--team-darryn))',
          taryn: 'hsl(var(--team-taryn))',
          yaseen: 'hsl(var(--team-yaseen))',
          sales: 'hsl(var(--team-sales))'
        },
        merchant: {
          black: '#0f0f0f',
          dark: '#1a1a1a',
          red: '#8B0000',
          redLight: '#dc2626',
          gray: '#2d2d2d',
          text: '#e5e5e5',
          blue: '#3b82f6',
          blueDark: '#1e3a8a'
        }
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)'
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' }
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' }
        }
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out'
      }
    }
  },
  plugins: [animatePlugin],
} satisfies Config;