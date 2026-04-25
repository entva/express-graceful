import config from 'eslint-config-entva-typescript-base';

export default [
  { ignores: ['dist/**', 'esm/**'] },
  ...config,
];
