/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          950: '#070B14',
          900: '#0B0F19',
          850: '#101626',
          800: '#161F36',
          700: '#202D4E',
        },
        volt: {
          400: '#4ADE80',
          500: '#22C55E',
          glow: '#00FF87',
        },
        cyan: {
          400: '#38BDF8',
          500: '#06B6D4',
          glow: '#00F0FF',
        },
        gold: {
          300: '#FDE047',
          400: '#FACC15',
          500: '#EAB308',
          600: '#CA8A04',
        }
      },
      fontFamily: {
        sans: ['Outfit', 'Inter', 'system-ui', 'sans-serif'],
        sports: ['Rajdhani', 'Outfit', 'sans-serif'],
      },
      boxShadow: {
        'volt-glow': '0 0 20px rgba(34, 197, 94, 0.45)',
        'cyan-glow': '0 0 20px rgba(6, 182, 212, 0.45)',
        'gold-glow': '0 0 25px rgba(234, 179, 8, 0.45)',
        'card-3d': '0 20px 40px rgba(0, 0, 0, 0.7), 0 0 30px rgba(34, 197, 94, 0.15)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'scan-laser': 'scan 2s ease-in-out infinite alternate',
        'glow-bounce': 'glowBounce 2s ease-in-out infinite',
      },
      keyframes: {
        scan: {
          '0%': { transform: 'translateY(0%)' },
          '100%': { transform: 'translateY(100%)' },
        },
        glowBounce: {
          '0%, 100%': { transform: 'scale(1)', opacity: '0.9' },
          '50%': { transform: 'scale(1.03)', opacity: '1' },
        }
      }
    },
  },
  plugins: [],
}
