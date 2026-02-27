/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.html',
    './invoice.html',
    './offline.html',
    './src/**/*.{js,mjs,html}',
    './styles/**/*.css',
  ],
  // Allow Tailwind to coexist with existing custom CSS
  corePlugins: {
    preflight: false, // Don't reset existing browser styles — existing CSS handles this
  },
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#FF7A18',
          dark:    '#FF6B02',
          light:   '#FF9A3D',
          50:      '#FFF7ED',
          100:     '#FFEDD5',
          200:     '#FED7AA',
          500:     '#FF7A18',
          600:     '#FF6B02',
          700:     '#E55A00',
        },
        brand: {
          orange: '#FF7A18',
          'orange-dark': '#FF6B02',
        },
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      // Fluid font sizes using clamp()
      fontSize: {
        'fluid-xs':   ['clamp(0.72rem, 1.8vw, 0.8rem)',   { lineHeight: '1.4' }],
        'fluid-sm':   ['clamp(0.8rem, 2.2vw, 0.875rem)',  { lineHeight: '1.5' }],
        'fluid-base': ['clamp(0.875rem, 2.5vw, 1rem)',    { lineHeight: '1.6' }],
        'fluid-lg':   ['clamp(1rem, 3vw, 1.125rem)',      { lineHeight: '1.5' }],
        'fluid-xl':   ['clamp(1.125rem, 3.5vw, 1.25rem)',  { lineHeight: '1.4' }],
        'fluid-2xl':  ['clamp(1.25rem, 4vw, 1.5rem)',     { lineHeight: '1.3' }],
        'fluid-3xl':  ['clamp(1.5rem, 5vw, 2rem)',        { lineHeight: '1.2' }],
      },
      // Fluid spacing using clamp()
      spacing: {
        'safe-b':  'env(safe-area-inset-bottom)',
        'safe-t':  'env(safe-area-inset-top)',
        'safe-l':  'env(safe-area-inset-left)',
        'safe-r':  'env(safe-area-inset-right)',
        'fluid-1': 'clamp(0.35rem, 1vw, 0.5rem)',
        'fluid-2': 'clamp(0.5rem, 1.5vw, 0.75rem)',
        'fluid-3': 'clamp(0.75rem, 2vw, 1rem)',
        'fluid-4': 'clamp(1rem, 2.5vw, 1.5rem)',
        'fluid-5': 'clamp(1.25rem, 3vw, 2rem)',
        '18': '4.5rem',
        '88': '22rem',
        '128': '32rem',
      },
      borderRadius: {
        'fluid-sm': 'clamp(0.5rem, 1.5vw, 0.75rem)',
        'fluid-md': 'clamp(0.75rem, 2vw, 1rem)',
        'fluid-lg': 'clamp(1rem, 2.5vw, 1.25rem)',
        'pill': '999px',
      },
      minHeight: {
        'touch': '44px',
        'touch-lg': '48px',
        'header': '56px',
      },
      maxWidth: {
        'content': 'min(100% - clamp(1rem, 3vw, 2rem), 1100px)',
      },
      boxShadow: {
        'card':    '0 2px 8px rgba(0,0,0,0.08)',
        'card-lg': '0 4px 16px rgba(0,0,0,0.10)',
        'fab':     '0 10px 24px rgba(255,122,24,0.38)',
        'focus':   '0 0 0 3px rgba(255,122,24,0.20)',
      },
      zIndex: {
        'header': '70',
        'fab':    '90',
        'nav':    '80',
        'modal':  '200',
      },
      screens: {
        'xs':   '360px',
        'sm':   '480px',
        'md':   '640px',
        'lg':   '768px',
        'xl':   '1024px',
        '2xl':  '1280px',
      },
    },
  },
  plugins: [],
};
