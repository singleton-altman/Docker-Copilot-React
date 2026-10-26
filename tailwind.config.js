/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // 主色：翡翠绿。克制的单一强调色，避免蓝紫渐变；深色模式下作为唯一高亮点缀。
        primary: {
          50: '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          300: '#6ee7b7',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
          800: '#065f46',
          900: '#064e3b',
        },
        // 中性色：石墨色阶。深色端更深（950 近黑），浅色端保持干净的中性灰。
        gray: {
          50: '#f6f6f7',
          100: '#ececee',
          200: '#d9d9de',
          300: '#b9b9c1',
          400: '#8b8b95',
          500: '#63636c',
          600: '#4a4a52',
          700: '#313138',
          800: '#1e1e24',
          900: '#121216',
          950: '#0a0a0d',
        }
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'pulse-slow': 'pulse 3s infinite',
        'fadeIn': 'fadeIn 0.4s ease-out',
        'bounceIn': 'bounceIn 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        bounceIn: {
          '0%': { transform: 'scale(0.8)', opacity: '0' },
          '50%': { transform: 'scale(1.05)', opacity: '1' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        }
      },
      spacing: {
        'safe': 'max(1rem, env(safe-area-inset-bottom))',
      }
    },
  },
  plugins: [],
}
