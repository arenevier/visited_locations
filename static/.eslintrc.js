module.exports = {
  extends: [
    'eslint:recommended',
  ],
  root: true,

  rules: {
    "no-unused-vars": "off",
  },

  globals: {
    L: "readonly",
    SimpleBox: "readonly",
  },


  env: {
    browser: true,
    es2022: true,
  },

};

