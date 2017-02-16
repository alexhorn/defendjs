"use strict";

var assert = require("assert");

var _ = require("lodash");

var estest = require("../estest");
var ESUtils = require("../esutils");
var traverser = require("../traverser");
var utils = require("../utils");

module.exports = class Scopes {

    constructor (logger) {
        this.logger = logger;
        this.esutils = new ESUtils(logger);
    }

    /**
     * Moves all variables to scope arrays like
     * var a = 1, b = 2;
     * to
     * var $$scope$abc = [];
     * $$scope$abc[0] = 1;
     * $$scope$abc[1] = 2;
     * @param {Node} ast Root node
     * @param {ScopeManager} scopeManager Scope manager
     */
    createScopeObjects (ast, scopeManager) {
        assert.ok(estest.isNode(ast));
        
        this.esutils.setParentsRecursive(ast);
        var scopes = scopeManager.acquireAll(ast);
        var rngAlpha = new utils.UniqueRandomAlpha(3);
        scopeManager.scopes.forEach(scope => {
            var scopeVarName = `$$scope$${rngAlpha.get()}`;
            
            var counter = 0;
            var scopeDecl = {
                type: "VariableDeclaration",
                kind: "var",
                declarations: [
                    {
                        type: "VariableDeclarator",
                        id: { type: "Identifier", name: scopeVarName },
                        init: { type: "ArrayExpression", elements: [] }
                    }
                ],
                $$defendjs$scopeObject: true
            };
            
            this.esutils.insertIntoScope(scope, scopeDecl);
            
            scope.variables.forEach(variable => {
                var index = counter++;
                
                variable.defs.forEach(def => {
                    if (def.type == "Variable") {
                        assert(def.parent.type == "VariableDeclaration");
                        def.parent.declarations = def.parent.declarations.filter(x => x != def.node);
                        var replacement = [];
                        if (def.node.init) {
                            replacement.push({
                                type: "ExpressionStatement",
                                expression: {
                                    type: "AssignmentExpression",
                                    operator: "=",
                                    left: {
                                        type: "MemberExpression",
                                        object: { type: "Identifier", name: scopeVarName },
                                        property: { type: "Literal", value: index },
                                        computed: true,
                                        $$defendjs$scopeObjectReference: true
                                    },
                                    right: def.node.init
                                }
                            });
                        }
                        if (def.parent.declarations.length > 0) {
                            replacement.push(def.parent);
                        }
                        if (replacement.length == 0) {
                            this.esutils.replaceNode(scope.block, def.parent, { type: "EmptyStatement" });
                        } else if (replacement.length == 1) {
                            this.esutils.replaceNode(scope.block, def.parent, replacement[0] );
                        } else {
                            this.esutils.replaceNode(scope.block, def.parent, { type: "BlockStatement", body: replacement });
                        }
                        variable.references.forEach(reference => {
                            // References can not be replaced via replaceNodeEx for whatever reason
                            this.esutils.replaceNode(scope.block, reference.identifier, {
                                type: "MemberExpression",
                                object: { type: "Identifier", name: scopeVarName },
                                property: { type: "Literal", value: index },
                                computed: true,
                                $$defendjs$scopeObjectReference: true
                            });
                        });
                    } else if (def.type == "CatchClause") {
                        Object.defineProperty(scope.block, "$$defendjs$exception", {
                            value: {
                                type: "MemberExpression",
                                object: { type: "Identifier", name: scopeVarName },
                                property: { type: "Literal", value: index },
                                computed: true,
                                $$defendjs$scopeObjectReference: true
                            },
                            configurable: true
                        });
                        this.esutils.insertIntoScope(scope, {
                            type: "ExpressionStatement",
                            expression: {
                                type: "AssignmentExpression",
                                operator: "=",
                                left: {
                                    type: "MemberExpression",
                                    object: { type: "Identifier", name: scopeVarName },
                                    property: { type: "Literal", value: index },
                                    computed: true,
                                    $$defendjs$scopeObjectReference: true
                                },
                                right: def.name
                            }
                        }, 1);
                        variable.references.forEach(reference => {
                            this.esutils.replaceNode(scope.block, reference.identifier, {
                                type: "MemberExpression",
                                object: { type: "Identifier", name: scopeVarName },
                                property: { type: "Literal", value: index },
                                computed: true,
                                $$defendjs$scopeObjectReference: true
                            });
                        });
                    } else if (def.type == "FunctionName") {
                        variable.references.forEach(reference => {
                            this.esutils.replaceNode(scope.block, reference.identifier, {
                                type: "CallExpression",
                                callee: { type: "Identifier", name: "$$defendjs$bind" },
                                arguments: [
                                    reference.identifier,
                                    { type: "Identifier", name: scopeVarName }
                                ]
                            });
                        });
                    }
                });
            });
            
            traverser.traverse(scope.block, [], (node, stack) => {
                if (scope.block == node) {
                    return node;
                }
                
                if (node.type.indexOf("Function") == 0) {
                    node.params.unshift({
                        type: "Identifier",
                        name: scopeVarName
                    });
                }
                
                if (node.type == "FunctionExpression") {
                    return {
                        type: "CallExpression",
                        callee: { type: "Identifier", name: "$$defendjs$bind" },
                        arguments: [
                            node,
                            { type: "Identifier", name: scopeVarName }
                        ]
                    };
                }
                
                return node;
            });
        });
    }

};
