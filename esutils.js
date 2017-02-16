"use strict";

var assert = require("assert");

var estest = require("./estest");
var traverser = require("./traverser");

module.exports = function (logger) {
    
    this.setParents = function (node) {
        assert.ok(estest.isNode(node));
        
        traverser.visitChildrenEx(node, (child, key) => {
            Object.defineProperty(child, "$$defendjs$parent", {
                value: node,
                configurable: true
            });
            return child;
        });
    };

    this.setParentsRecursive = function (node) {
        assert.ok(estest.isNode(node));
        
        traverser.visitChildrenEx(node, (child, key) => {
            Object.defineProperty(child, "$$defendjs$parent", {
                value: node,
                configurable: true
            });
            this.setParentsRecursive(child);
            return child;
        });
    };

    this.insertIntoScope = function (scope, node, idx) {
        assert.ok(estest.isNode(node));
        
        idx = idx || 0;

        if (scope.block.body.type == "Program" || scope.block.body.type == "BlockStatement") {
            scope.block.body.body.splice(idx, 0, node);
            
            Object.defineProperty(node, "$$defendjs$parent", {
                value: scope.block.body,
                configurable: true
            });
        } else if (scope.block.type == "Program" || scope.block.type == "BlockStatement") {
            scope.block.body.splice(idx, 0, node);
            
            Object.defineProperty(node, "$$defendjs$parent", {
                value: scope.block,
                configurable: true
            });
        } else {
            throw new Error("Cannot insert into scope.block of type " + scope.block.type);
        }
    };
    
    this.replaceNode = function (root, child, replacement) {
        assert.ok(estest.isNode(root));
        assert.ok(estest.isNode(child));
        assert.ok(estest.isNode(replacement));
        assert.equal(estest.isStatement(child), estest.isStatement(replacement), `Replacee ${child.type} is not of the same type as replacement ${replacement.type}`);
        assert.equal(estest.isExpression(child), estest.isExpression(replacement), `Replacee ${child.type} is not of the same type as replacement ${replacement.type}`);
        
        var _this = this;
        root = this.getParent(child) || root;
        traverser.traverseEx(root, [], function (node, stack) {
            if (node == child) {
                this.abort();
                Object.defineProperty(replacement, "$$defendjs$parent", {
                    value: child.$$defendjs$parent,
                    configurable: true
                });
                _this.setParents(replacement);
                return replacement;
            } else {
                return node;
            }
        });
    };

    this.getParent = function (node) {
        assert.ok(estest.isNode(node));
        
        var parent = node.$$defendjs$parent;
        var legit = false;
        if (parent) {
            traverser.visitChildren(parent, child => {
                if (node == child) {
                    legit = true;
                }
                return child;
            });
        }
        if (legit) {
            return parent;
        } else if (parent) {
            logger.debug("Child has wrong parent");
            return null;
        } else {
            logger.debug("Child has no parent");
            return null;
        }
    };

};
