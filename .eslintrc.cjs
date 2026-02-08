module.exports = {
    root: true,
    env: { browser: true, es2020: true },
    parserOptions: {
        ecmaFeatures: {
            modules: true
        }
    },
    extends: [
        'airbnb-base',
        'eslint:recommended',
        'prettier',
    ],
    rules: {
        'no-console': ['error', { allow: ['warn', 'error'] }],
        curly: [2, 'all'],
        'keyword-spacing': ['error', { before: true }],
        semi: 1,
        'no-unexpected-multiline': 0,
        'array-element-newline': [1, 'consistent'],
        'class-methods-use-this': 0,
        'import/prefer-default-export': 0,
        'no-void': 0,
        'import/no-relative-packages': 0,
        'import/no-unresolved': 0,
        'import/extensions': 0,
        'no-plusplus': 0,
        'no-bitwise': 0,
        'no-param-reassign': ['error', { props: false }],
        'no-multiple-empty-lines': [2, { max: 1, maxBOF: 1 }],
        'prefer-destructuring': 0,
        camelcase: ['error', { allow: ['^UNSAFE_'] }],
        'import/no-extraneous-dependencies': 0,
        'no-restricted-syntax': 0,
        'no-underscore-dangle': 0,
        'no-use-before-define': ['error', { functions: false }],
        'default-case': 0,
        'no-lonely-if': 0,
        'one-var': 0,
        'consistent-return': 0,
        'object-shorthand': 1,
        'operator-assignment': 1,
    },
};
