"use strict";

const METHODS_INJECT = `
function $$defendjs$mergeArguments(a, b) {
    return Array.prototype.slice.call(a).concat(Array.prototype.slice.call(b));
}

function $$defendjs$bind() {
    var fn = arguments[0], prepend = Array.prototype.slice.call(arguments, 1);
    var wrapper = function() {
        return fn.apply(this, prepend.concat(Array.prototype.slice.call(arguments)));
    };
    wrapper.prototype = fn.prototype;
    return wrapper;
}

function $$defendjs$sliceArguments(args, num) {
    return Array.prototype.slice.call(args, num);
}

function $$defendjs$toObject(arr) {
    var obj = {};
    for (var i = 0; i < arr.length; i += 2) {
        obj[arr[i]] = arr[i + 1];
    }
    return obj;
}

function $$defendjs$decodeString(arr) {
    return arr.map(function(x) { return String.fromCharCode(x & ~0 >>> 16) + String.fromCharCode(x >> 16); }).join("");
}

function $$defendjs$fromCharCodes() {
    return String.fromCharCode.apply(null, arguments);
}

`;

var assert = require("assert");
var fs = require("fs");

var _ = require("lodash");
var escope = require("escope");
var esprima = require("esprima");

var estest = require("../estest");
var traverser = require("../traverser");
var utils = require("../utils");

/**
 * Wrap function with $$defendjs$bind.
 * @param {Identifier} Function identifier
 * @returns {Node} Wrapped function
 */
function createMethodStub(id) {
    assert.equal(id.type, "Identifier");
    
    return {
        type: "CallExpression",
        callee: { type: "Identifier", name: "$$defendjs$bind" },
        arguments: [
            id
        ]
    };
}

/**
 * Get index of argument in function.
 * @param {Function} method Function
 * @param {Identifier} identifier} Argument identifier
 * @returns {number} Index of argument
 */
function getArgumentIndex(method, identifier) {
    assert.ok(estest.isFunction(method));
    assert.equal(identifier.type, "Identifier");
    
    return _.findIndex(method.params, x => x.name == identifier.name);
}

module.exports = class Methods {

    constructor (logger) {
        this.logger = logger;
    }
    
    /**
     * Adds helper methods to the beginning of the app.
     * @param {Node} Root node
     */
    addCustomBind (ast) {
        assert.ok(estest.isNode(ast));
        
        var code = esprima.parse(METHODS_INJECT);
        code.type = "BlockStatement";
        ast.body.splice(0, 0, code);
    }
    
    /**
     * Checks whether a method refers to the "arguments" array.
     * @param {Function} method
     * @param {ScopeManager} scopeManager
     * @returns {boolean}
     */
    methodRefersToArguments (method, scopeManager) {
        assert.ok(estest.isFunction(method));
        assert.ok(scopeManager);
        
        return scopeManager
        .acquire(method)
        .references
        .some(reference => !utils.isResolvedReference(reference) && reference.identifier.name == "arguments");
    }
    
    /**
     * Inserts code to slice arguments from the arguments array like
     * function () { ... }
     * to
     * function () { arguments = $$defendjs$sliceArguments(arguments, 1); ... }
     * @param {Function} method
     * @param {number} num Number of arguments to be sliced off. 0 if none.
     */
    removeFirstArguments (method, num) {
        assert.ok(estest.isFunction(method));
        assert.equal(typeof num, "number");
        
        if (num > 0) {
            method.body.body.splice(0, 0, {
                type: "ExpressionStatement",
                expression: {
                    type: "AssignmentExpression",
                    operator: "=",
                    left: { type: "Identifier", name: "arguments" },
                    right: {
                        type: "CallExpression",
                        callee: { type: "Identifier", name: "$$defendjs$sliceArguments" },
                        arguments: [
                            { type: "Identifier", name: "arguments" },
                            { type: "Literal", value: num, $$defendjs$removeFirstArguments: true }
                        ]
                    }
                },
                $$defendjs$slicingArguments: true
            });
        }
        
        method.body.body.splice(0, 0, {
            type: "VariableDeclaration",
            kind: "var",
            declarations: [
                {
                    type: "VariableDeclarator",
                    id: { type: "Identifier", name: "$$defendjs$arguments" },
                    init: { type: "Identifier", name: "arguments" }
                }
            ],
            $$defendjs$reassigningArguments: true,
            $$defendjs$followsSlicingArguments: num > 0
        });
    }

    /**
     * Lists all methods.
     * @param {Node} ast Root node
     * @returns {string[]} Method names
     */
    listMethods (ast) {
        assert.ok(estest.isNode(ast));
        
        var methods = [];
        
        traverser.traverse(ast, [], (node, stack) => {
            if (node.type == "FunctionDeclaration") { // Statement
                methods.push(node.id.name);
            } else if (node.type == "FunctionExpression") { // Expression
                methods.push(`$$anon$${utils.hash(node)}`);
            }
            
            return node;
        });
        
        return methods;
    }

    /**
     * Extracts all methods from the AST.
     * @param {Node} ast Root node
     * @returns {Function[]}
     */
    extractMethods (ast) {
        assert.ok(estest.isNode(ast));
        
        var methods = [];
        
        traverser.traverse(ast, [], (node, stack) => {
            if (node.type == "FunctionDeclaration") { // Statement
                methods.push(node);
                return { type: "ExpressionStatement", expression: createMethodStub(node.id) }; // This is not ideal
            } else if (node.type == "FunctionExpression") { // Expression
                var id = `$$anon$${utils.hash(node)}`;
                // Merge into old object instead of creating a new one to preserve object references
                methods.push(_.assign(node, {
                    type: "FunctionDeclaration",
                    id: { type: "Identifier", name: id }
                }));
                return createMethodStub({ type: "Identifier", name: id });
            }
            
            return node;
        });
        
        return methods;
    }

    /**
     * Replaces direct argument references with arguments references like
     * function (a) { return a; }
     * to
     * function (a) { return $$defendjs$arguments[0]; }
     * @param {Function} method Function whose body will be transformed
     * @param {boolean} useReassignedVariable Use $$defendjs$arguments instead of arguments
     * @returns {Function} Function from method parameter
     */
    replaceArgumentReferences (method, useReassignedVariable) {
        assert.ok(estest.isFunction(method));
        
        traverser.traverse(method.body, [], (node, stack) => {
            if (node.type == "Identifier") {
                var index = getArgumentIndex(method, node);
                if (index != -1) {
                    return {
                        type: "MemberExpression",
                        object: { type: "Identifier", name: useReassignedVariable ? "$$defendjs$arguments" : "arguments" },
                        property: { type: "Literal", value: index },
                        computed: true
                    };
                }
            }
            
            return node;
        });
        
        method.params = [];
        
        return method;
    }

    /**
     * Replaces function calls with main calls like
     * test()
     * to
     * $$defendjs$bind(main, 1234)()
     * @param {Node} ast Root node
     * @param {Object[]} methodEntryExitPoints Method entry point table
     * @param {number} methodEntryExitPoints[].entry Entry point
     */
    replaceFunctionCalls (ast, methodEntryExitPoints) {
        assert.ok(estest.isNode(ast));
        assert.equal(typeof methodEntryExitPoints, "object");
        
        traverser.traverse(ast, [], (node, stack) => {
            if (node.type == "Identifier" && methodEntryExitPoints[node.name] && methodEntryExitPoints[node.name].entry) {
                return {
                    type: "CallExpression",
                    callee: { type: "Identifier", name: "$$defendjs$bind" },
                    arguments: [
                        { type: "Identifier", name: "main" },
                        { type: "Identifier", name: methodEntryExitPoints[node.name].entry }
                    ]
                };
            }
            return node;
        });
    }

    /**
     * Bumps all arguments indices like
     * $$defendjs$arguments[0]
     * to
     * $$defendjs$arguments[1]
     * @param {Function} method Function whose body will be transformed
     * @param {number} inc Number to be added to all argument indices
     */
    bumpArgumentsIndices (method, inc) {
        assert.ok(estest.isFunction(method));
        assert.equal(typeof inc, "number");
        
        traverser.traverse(method.body, [], (node, stack) => {
            if (node.type == "MemberExpression" && node.object.type == "Identifier" && node.object.name == "$$defendjs$arguments") {
                node.property.value += inc;
            }
            if (node.$$defendjs$removeFirstArguments) {
                node.value += inc;
            }
            return node;
        });
    }
    
};