"use strict";

var assert = require("assert");

var _ = require("lodash");

var utils = require("../utils");
var traverser = require("../traverser");
var estest = require("../estest");

/**
 * Chain an array of expressions with an operator.
 * @param {Expression[]} expressions
 * @param {BinaryOperator} operator
 * @returns {Expression}
 */
function chain (expressions, operator) {
    assert.ok(Array.isArray(expressions));
    assert.equal(typeof operator, "string");
    
    if (expressions.length == 0) {
        return { type: "Literal", value: true };
    } else if (expressions.length == 1) {
        return expressions[0];
    } else {
        var result = expressions[0];
        for (var i = 1; i < expressions.length; ++i) {
            result = {
                type: "BinaryExpression",
                operator: operator,
                left: result,
                right: expressions[1]
            };
        }
        return result;
    }
}

/**
 * Return node body as an array.
 * @param {Node} node
 * @returns {Node[]}
 */
function blockToArray (node) {
    assert.ok(estest.isNode(node));
    
    if (Array.isArray(node.body)) {
        return node.body;
    } else {
        return [ node.body ];
    }
}

module.exports = class Normalizer {

    constructor (logger) {
        this.logger = logger;
        this.rngAlpha = new utils.UniqueRandomAlpha(3);
    }

    /**
     * Simplify AST.
     * @param {Node} ast Root node
     * @returns {Node}
     */
    simplify (ast) {
        assert.ok(estest.isNode(ast));
        
        return traverser.traverse(ast, [], (node, stack) => {
            switch (node.type) {
                case "Program":
                case "BlockStatement":
                    return this.simplifyBlockStatement(node);
                /*case "WhileStatement":
                    return this.simplifyWhileStatement(node);*/
                /*case "DoWhileStatement":
                    return this.simplifyDoWhileStatement(node);*/
                case "ForStatement":
                    return this.simplifyForStatement(node);
                case "ForInStatement":
                    return this.simplifyForStatement(this.simplifyForInStatement(node));
                /*case "SwitchStatement":
                    return this.simplifySwitchStatement(node);*/
                case "TryStatement":
                    return this.simplifyTryStatement(node);
                default:
                    return node;
            }
        });

    }

    /**
     * Simplify BlockStatement.
     * @param {BlockStatement} node
     * @return {Node}
     */
    simplifyBlockStatement (node) {
        assert.ok(estest.isNode(node));
    
        function getBlockBodys(node) {
            if (node.type == "Program" || node.type == "BlockStatement") {
                var stmts = [];
                node.body.forEach(stmt => utils.push(stmts, getBlockBodys(stmt)));
                return stmts;
            } else {
                return [ node ];
            }
        }
        
        return {
            type: node.type,
            body: getBlockBodys(node)
        };
    }

    /**
     * Simplify WhileStatement.
     * @param {WhileStatement} node
     * @return {Node}
     */
    simplifyWhileStatement (node) {
        assert.ok(estest.isNode(node));
        
        return {
            type: "WhileStatement",
            test: { type: "Literal", value: true },
            body: {
                type: "IfStatement",
                test: node.test,
                consequent: node.body,
                alternate: { type: "BreakStatement" }
            }
        };
    }

    /**
     * Simplify DoWhileStatement.
     * @param {DoWhileStatement} node
     * @return {Node}
     */
    simplifyDoWhileStatement (node) {
        assert.ok(estest.isNode(node));
        
        return {
            type: "WhileStatement",
            test: { type: "Literal", value: true },
            body: {
                type: "BlockStatement",
                body: [
                    node.body,
                    {
                        type: "IfStatement",
                        test: node.test,
                        consequent: { type: "EmptyStatement" },
                        alternate: { type: "BreakStatement" }
                    }
                ]
            }
        };
    }

    /**
     * Simplify ForStatement.
     * @param {ForStatement} node
     * @return {Node}
     */
    simplifyForStatement (node) {
        assert.ok(estest.isNode(node));
        
        var body = [];
        if (node.init) {
            if (estest.isStatement(node.init)) {
                body.push(node.init);
            } else if (estest.isExpression(node.init)) {
                body.push({
                    type: "ExpressionStatement",
                    expression: node.init
                });
            } else {
                throw new Error("Invalid node.init type " + node.init.type);
            }
        }
        body.push({
            type: "WhileStatement",
            test: node.test,
            body: {
                type: "BlockStatement",
                body: blockToArray(node.body).concat(node.update ? [
                    {
                        type: "ExpressionStatement",
                        expression: node.update
                    }
                ] : [])
            }
        });
        return {
            type: "BlockStatement",
            body: body
        };
    }

    /**
     * Simplify ForInStatement.
     * @param {ForInStatement} node
     * @return {Node}
     */
    simplifyForInStatement (node) {
        assert.ok(estest.isNode(node));
        
        var propsName = `$$forin$props$${this.rngAlpha.get()}`, iterName = `$$forin$iter$${this.rngAlpha.get()}`;
        
        var forStmt = {
            type: "ForStatement",
            init: {
                type: "VariableDeclaration",
                kind: "var",
                declarations: [
                    {
                        type: "VariableDeclarator",
                        id: { type: "Identifier", name: propsName },
                        init: {
                            type: "CallExpression",
                            callee: {
                                type: "MemberExpression",
                                object: { type: "Identifier", name: "Object" },
                                property: { type: "Identifier", name: "keys" },
                                computed: false
                            },
                            arguments: [
                                node.right
                            ]
                        }
                    },
                    {
                        type: "VariableDeclarator",
                        id: { type: "Identifier", name: iterName },
                        init: { type: "Literal", value: 0 }
                    }
                ]
            },
            test: {
                type: "BinaryExpression",
                operator: "<",
                left: { type: "Identifier", name: iterName },
                right: {
                    type: "MemberExpression",
                    object: { type: "Identifier", name: propsName },
                    property: { type: "Identifier", name: "length" },
                    computed: false
                }
            },
            update: {
                type: "UpdateExpression",
                operator: "++",
                argument: { type: "Identifier", name: iterName },
                prefix: true
            },
            body: {
                type: "BlockStatement",
                body: [
                    node.left.type == "VariableDeclaration"
                    ?
                    {
                        type: "VariableDeclaration",
                        kind: "var",
                        declarations: [
                            {
                                type: "VariableDeclarator",
                                id: node.left.declarations[0].id,
                                init:  {
                                    type: "MemberExpression",
                                    object: { type: "Identifier", name: propsName },
                                    property: { type: "Identifier", name: iterName },
                                    computed: true
                                }
                            }
                        ]
                    }
                    :
                    {
                        type: "ExpressionStatement",
                        expression: {
                            type: "AssignmentExpression",
                            operator: "=",
                            left: node.left,
                            right: {
                                type: "MemberExpression",
                                object: { type: "Identifier", name: propsName },
                                property: { type: "Identifier", name: iterName },
                                computed: true
                            }
                        }
                    },
                    node.body
                ]
            }
        };
        return forStmt;
    }

    /**
     * Simplify SwitchStatement.
     * @param {SwitchStatement} node
     * @return {Node}
     */
    simplifySwitchStatement (node) {
        assert.ok(estest.isNode(node));
        
        var cases = node.cases.map(c => {
            var breakIndex = _.findIndex(c.consequent, x => x.type == "BreakStatement");
            var statements, breaks;
            if (breakIndex != -1) {
                statements = c.consequent.slice(0, breakIndex);
                breaks = true;
            } else {
                statements = c.consequent;
                breaks = false;
            }
            return {
                test: c.test,
                statements: statements,
                breaks: breaks
            };
        });
        
        var stack = [], ifStmts = [];
        for (let i = 0; i < cases.length; ++i) {
            stack.push(cases[i]);
            if (cases[i].breaks) {
                var testName = `$$switchtest$${this.rngAlpha.get()}`;
                var ifStmt;
                
                for (var j = 0; j < stack.length; ++j) {
                    var sliced = stack.slice(0, j + 1);
                    if (sliced.every(x => x.test)) {
                        
                        ifStmt = {
                            type: "BlockStatement",
                            body: [
                                {
                                    type: "VariableDeclaration",
                                    kind: "var",
                                    declarations: [
                                        {
                                            type: "VariableDeclarator",
                                            id: { type: "Identifier", name: testName }
                                        }
                                    ]
                                }
                            ]
                        };
                        ifStmt = {
                            type: "IfStatement",
                            test: chain(sliced.map(x => {
                                return { type: "BinaryExpression", operator: "==", left: x.test, right: node.discriminant };
                            }), "||"),
                            consequent: {
                                type: "BlockStatement",
                                body: (ifStmt ? [ ifStmt ] : []).concat(stack[j].statements)
                            }
                        };
                    } else {
                        ifStmt = {
                            type: "BlockStatement",
                            body: (ifStmt ? [ ifStmt ] : []).concat(stack[j].statements)
                        };
                    }
                }
                ifStmts.push(ifStmt);
                
                ifStmt = null;
                stack = [];
            }
        }
        this.logger.log(ifStmts);
        var combinedIfStmt = ifStmts[ifStmts.length - 1];
        for (let i = ifStmts.length - 2; i >= 0; --i) {
            combinedIfStmt = {
                type: "IfStatement",
                test: ifStmts[i].test,
                consequent: ifStmts[i].consequent,
                alternate: combinedIfStmt
            };
        }
        return combinedIfStmt;
    }

    /**
     * Simplify TryStatement.
     * @param {TryStatement} node
     * @return {Node}
     */
    simplifyTryStatement (node) {
        assert.ok(estest.isNode(node));
        
        if (node.finalizer) {
            if (node.handler) {
                return this.simplifyTryStatement({
                    type: "TryStatement",
                    block: {
                        type: "BlockStatement",
                        body: [
                            {
                                type: "TryStatement",
                                block: node.block,
                                handler: node.handler
                            }
                        ]
                    },
                    finalizer: node.finalizer
                });
            } else {
                var finalizer = node.finalizer;
                traverser.traverseEx(node.block, [], (node, stack) => {
                    if (stack.some(x => estest.isFunction(x.node))) {
                        this.abort();
                        return node;
                    } else if (node.type == "ReturnStatement") {
                        return {
                            type: "BlockStatement",
                            body: [
                                {
                                    type: "VariableDeclaration",
                                    kind: "var",
                                    declarations: [
                                        {
                                            type: "VariableDeclarator",
                                            id: { type: "Identifier", name: "$$defendjs$return" },
                                            init: node.argument
                                        }
                                    ]
                                },
                                utils.cloneISwearIKnowWhatImDoing(finalizer),
                                {
                                    type: "ReturnStatement",
                                    argument: { type: "Identifier", name: "$$defendjs$return" }
                                }
                            ]
                        };
                    } else {
                        return node;
                    }
                });
                
                return {
                    type: "BlockStatement",
                    body: [
                        {
                            type: "TryStatement",
                            block: node.block,
                            handler: {
                                type: "CatchClause",
                                param: { type: "Identifier", name: "$$defendjs$e" },
                                body: {
                                    type: "BlockStatement",
                                    body: [
                                        {
                                            type: "VariableDeclaration",
                                            kind: "var",
                                            declarations: [
                                                {
                                                    type: "VariableDeclarator",
                                                    id: { type: "Identifier", name: "$$defendjs$_e" },
                                                    init: { type: "Identifier", name: "$$defendjs$e" }
                                                }
                                            ]
                                        }
                                    ]
                                }
                            }
                        },
                        node.finalizer,
                        {
                            type: "IfStatement",
                            test: { type: "Identifier", name: "$$defendjs$_e" },
                            consequent: {
                                type: "ThrowStatement",
                                argument: { type: "Identifier", name: "$$defendjs$_e" }
                            }
                        }
                    ]
                };
            }
        } else {
            return node;
        }
    }

};
