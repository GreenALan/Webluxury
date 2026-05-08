import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/app/**/*.{ts,tsx}', './src/components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: '#111111',
          soft: '#3a3a3a'
        },
        bone: {
          DEFAULT: '#faf8f5',
          dark: '#efeae3'
        },
        accent: {
          DEFAULT: '#8a6d3b',
          dark: '#6b5328'
        },
        line: '#e5e1d8'
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        serif: ['var(--font-serif)', 'Georgia', 'serif']
      },
      borderRadius: {
        DEFAULT: '2px',
        md: '4px',
        lg: '8px'
      },
      letterSpacing: {
        wide: '0.06em',
        wider: '0.12em'
      }
    }
  },
  plugins: []
};

export default config;
