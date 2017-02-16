module.exports = {
    "env": {
        "es6": true,
        "node": true
    },
    "extends": "eslint:recommended",
    "parserOptions": {
        "sourceType": "module"
    },
    "rules": {
        "indent": [
            "error",
            4,
            { "SwitchCase": 1 }
        ],
        "linebreak-style": [
            "error",
            "windows"
        ],
        "quotes": [
            "error",
            "double"
        ],
        "semi": [
            "error",
            "always"
        ],
        
        "no-console": "off",
        "no-unused-vars": "off",
        
        "array-callback-return": "error",
        "consistent-return": "error",
        "curly": "error",
        "dot-notation": "error",
        "guard-for-in": "error",
        "no-loop-func": "error",
        "no-throw-literal": "error",
        "no-unmodified-loop-condition": "error",
        "no-useless-escape": "error"
    }
};