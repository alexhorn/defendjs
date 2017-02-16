"use strict";

var assert = require("assert");

var _ = require("lodash");
var escodegen = require("escodegen");

var estest = require("../estest");
var traverser = require("../traverser");


module.exports = class Health {

    constructor (logger) {
        this.logger = logger;
        this.strict = false;
    }
    
    throwError (msg) {
        if (this.strict) {
            throw new Error(msg);
        } else {
            this.logger.warn(msg);
        }
    }
    
    /**
     * Perform various health checks on the AST without modifying it.
     * @param {Node} ast Root node
     * @returns {Node} Root node
     */
    check (ast) {
        var visited = [];
        
        traverser.traverse(ast, [], (node, stack) => {
            if (_.includes(visited, node)) {
                this.throwError("Node has multiple parents: " + JSON.stringify(node));
            } else {
                visited.push(node);
            }
            
            if (node.type == "BlockStatement") {
                node.body.forEach(stmt => {
                    if (!estest.isStatement(stmt)) {
                        this.throwError(JSON.stringify(stack[1], null, 2));
                    }
                });
            }
            
            return node;
        });
        
        return ast;
    }
};
