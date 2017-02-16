"use strict";

var assert = require("assert");

var esshorten = require("esshorten");

var estest = require("../estest");

module.exports = class Uglifier {

    constructor (logger) {
        this.logger = logger;
    }

    /**
     * Uglifies tree.
     * @param {Node} ast Root node
     * @returns {Node} Root node
     */
    uglify (ast) {
        assert.ok(estest.isNode(ast));
        
        return esshorten.mangle(ast);
    }

};