/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/client/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          900: '#08080A',
          800: '#0D0D10',
          700: '#121216',
          600: '#191920',
          500: '#22222B',
          400: '#2C2C37',
        },
        gold: {
          50: '#FBF6EA',
          100: '#F3E7CB',
          200: '#E7D3A6',
          300: '#DCC08A',
          400: '#D0AC6B',
          500: '#C29A57',
          600: '#A87F3F',
        },
        cream: '#F6F2E9',
        smoke: '#A8A6A0',
      },
      fontFamily: {
        display: ['"Playfair Display"', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      boxShadow: {
        gold: '0 0 0 1px rgba(208,172,107,0.35), 0 18px 50px -20px rgba(0,0,0,0.9)',
        card: '0 20px 40px -28px rgba(0,0,0,0.9)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        'slide-up': {
          '0%': { opacity: '0', transform: 'translateY(24px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: { '0%': { backgroundPosition: '-500px 0' }, '100%': { backgroundPosition: '500px 0' } },
      },
      animation: {
        'fade-up': 'fade-up 0.5s cubic-bezier(0.22,1,0.36,1) both',
        'fade-in': 'fade-in 0.35s ease both',
        'slide-up': 'slide-up 0.35s cubic-bezier(0.22,1,0.36,1) both',
        shimmer: 'shimmer 1.6s linear infinite',
      },
    },
  },
  plugins: [],
};
