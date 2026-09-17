import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}'
  ],
  theme: {
    extend: {
      colors: {
        wine: '#4B1F36',
        terracotta: '#C97663',
        rose: '#D8A7A0',
        cream: '#F9F3EB',
        graphite: '#3F3F3F',
        success: '#3F7D65',
        warning: '#D59B3A',
        danger: '#B84F56'
      },
      boxShadow: {
        soft: '0 18px 50px rgba(75,31,54,0.08)'
      },
      borderRadius: {
        '2xl': '1.35rem',
        '3xl': '1.75rem'
      }
    }
  },
  plugins: []
};

export default config;
