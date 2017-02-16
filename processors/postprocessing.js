"use strict";

var assert = require("assert");

var _ = require("lodash");

var estest = require("../estest");
var traverser = require("../traverser");
var utils = require("../utils");

/**
 * Merges nested bind calls like
 * $$defendjs$bind($$defendjs$bind(main, 1234), 5678)
 * to
 * $$defendjs$bind(main, 1234, 5678)
 * @param {Node} node
 * @returns {Node}
 */
function mergeNestedBinds(node) {
    assert.ok(estest.isNode(node));
    
    if (isBindCall(node)) {
        return mergeNestedBinds(node.arguments[0]).concat(node.arguments.slice(1)); 
    } else {
        return [ node ];
    }
}

/**
 * Checks whether node is a call to $$defendjs$bind.
 * @param {Node} node
 * @returns {boolean}
 */
function isBindCall(node) {
    assert.ok(estest.isNode(node));
    
    return node.type == "CallExpression"
        && node.callee.type == "Identifier"
        && node.callee.name == "$$defendjs$bind";
}

module.exports = class Postprocessing {

    constructor (logger) {
        this.logger = logger;
    }

    /**
     * Does postprocessing.
     * @param {Node} ast Root node
     * @return {Node} Root node
     */
    do (ast) {
        assert.ok(estest.isNode(ast));
        
        return traverser.traverse(ast, [], (node, stack) => {
            if (isBindCall(node)) {
                node.arguments = mergeNestedBinds(node);
            } else if (node.type == "BlockStatement" || node.type == "Program") {
                node.body = node.body.filter(x => x.type != "EmptyStatement");
            } else if (node.type == "SwitchCase") {
                node.consequent = node.consequent.filter(x => x.type != "EmptyStatement");
            }
            
            return node;
        });
    }

};
