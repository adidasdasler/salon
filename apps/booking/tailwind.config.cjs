module.exports = {
  presets: [require('@salon/config/tailwind.preset.cjs')],
  content: ['./index.html', './src/**/*.{ts,tsx}', '../../packages/ui/src/**/*.{ts,tsx}'],
};
