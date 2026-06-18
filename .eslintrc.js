module.exports = {
  parser: '@typescript-eslint/parser',
  extends: ['@typescript-eslint/recommended'],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true,
    },
  },
  env: {
    browser: true,
    es6: true,
    node: true,
  },
  rules: {
    // Add any custom rules here
  },
};</content>
<parameter name="filePath">.eslintrc.js