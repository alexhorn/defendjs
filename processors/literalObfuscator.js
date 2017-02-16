"use strict";

var assert = require("assert");

var esprima = require("esprima");

module.exports = class LiteralObfuscator {

    constructor (logger) {
        this.logger = logger;
    }
    
    /**
     * Generate an obfuscated string generator
     * @param {string} input
     * @returns {Node}
     */
    obfuscateString1 (input) {
        assert.equal(typeof input, "string");
        
        function is16Bit (s) {
            return s.split("").some(x => x.charCodeAt(0) > 65536);
        }
        
        var getCharCode = function (x) { return x.charCodeAt(0); };
        var chars = input.split("").map(getCharCode);

        var out = [];
        for (var i = 0; i < input.length; i += 2) {
            var n = chars[i] | (chars[i + 1] << 16);
            out.push(n);
        }
        
        return esprima.parse(`
        var input = ${JSON.stringify(out)};
        input.map(function(x) { return String.fromCharCode(x & ~0 >>> 16) + String.fromCharCode(x >> 16); }).join("");
        `);
    }
    
};
