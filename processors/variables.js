"use strict";

var assert = require("assert");

var _ = require("lodash");

var estest = require("../estest");
var ESUtils = require("../esutils");
var traverser = require("../traverser");
var utils = require("../utils");

module.exports = class Variables {

    constructor (logger) {
        this.logger = logger;
        this.esutils = new ESUtils(logger);
    }
    
    /**
     * Removes the id property from FunctionExpressions.
     * They trip up functionDeclarationToExpression and escope (?),
     * causing scopes.js to incorrectly rename some references.
     * @param {Node} ast Root node
     * @returns {Node} Root node
     */
    removeFunctionExpressionIds (ast) {
        return traverser.traverse(ast, [], (node, stack) => {
            if (node.type == "FunctionExpression" && node.id) {
                node.id = null;
            }
            return node;
        });
    }

    /**
     * Converts function declarations like
     * function test() { ... }
     * to function expression variables like
     * var test = function() { ... };
     * @param {Node} ast Root node
     * @param {ScopeManager} scopeManager Scope manager
     */
    functionDeclarationToExpression (ast, scopeManager) {
        assert.ok(estest.isNode(ast));
        
        this.esutils.setParentsRecursive(ast);
        
        scopeManager.scopes.forEach(scope => {
            scope.variables.forEach(variable => {
                variable.defs.forEach(def => {
                    if (def.type == "FunctionName") {
                        assert(estest.isFunction(def.node));
                        /**
                         * Here you have to ensure that def.node is statement.
                         * Expressions like { foo: function() { ... }} are parsed
                         * as a FunctionExpression with an id, which are then
                         * mistakingly replaced with EmptyStatements.
                         */
                        if (estest.isStatement(def.node)) {
                            this.esutils.replaceNode(ast, def.node, { type: "EmptyStatement" });
                            this.esutils.insertIntoScope(scope, {
                                type: "VariableDeclaration",
                                kind: "var",
                                declarations: [
                                    {
                                        type: "VariableDeclarator",
                                        id: def.node.id,
                                        init: {
                                            type: "FunctionExpression",
                                            params: def.node.params,
                                            body: def.node.body
                                        }
                                    }
                                ]
                            });
                        }
                    }
                });
            });
        });
    }

    /**
     * Renames identifiers with unique names, e.g.
     * var a, b = 5;
     * to
     * var $$var$123$a, $$var$123$b = 5;
     * @param {Node} ast Root node
     * @param {ScopeManager} scopeManager Scope manager
     */
    obfuscateIdentifiers (ast, scopeManager) {
        scopeManager.scopes.forEach(scope => {
            if (scope.isStatic()) {
                scope.variables.sort((a, b) => {
                    if (a.tainted) {
                        return 1;
                    }
                    if (b.tainted) {
                        return -1;
                    }
                    return (b.identifiers.length + b.references.length) - (a.identifiers.length + a.references.length);
                });

                for (let variable of scope.variables) {
                    var name = "$$var$" + utils.hash(variable) + "$" + variable.name;

                    if (variable.tainted) {
                        continue;
                    }

                    if (variable.identifiers.length === 0) {
                        // do not change names since this is a special name
                        continue;
                    }

                    for (let def of variable.identifiers) {
                        // change definition's name
                        def.name = name;
                    }

                    for (let ref of variable.references) {
                        // change reference's name
                        ref.identifier.name = name;
                    }
                }
            }
        });
    }

    /**
     * Replaces direct parameter references like
     * function (a) {
     *     return a;
     * }
     * to copys like
     * function (a) {
     *     var $$arg$abc = a;
     *     return $$arg$abc;
     * }
     * @param {Node} ast Root node
     * @param {ScopeManager} scopeManager Scope manager
     */
    redefineParameters (ast, scopeManager) {
        function getArgumentIndex(method, identifier) {
            assert(method.type == "FunctionDeclaration" || method.type == "FunctionExpression");
            assert(identifier.type == "Identifier");
            for (var i = 0; i < method.params.length; ++i) {
                if (method.params[i].name == identifier.name) {
                    return i;
                }
            }
            return -1;
        }
        
        var rng = new utils.UniqueRandomAlpha(3);
        
        scopeManager.scopes.forEach(scope => {
            scope.variables.forEach(variable => {
                variable.defs.forEach(def => {
                    if (def.type == "Parameter") {
                        assert(def.name.type == "Identifier");
                        var name = "$$arg$" + rng.get();
                        
                        this.esutils.insertIntoScope(scope, {
                            type: "VariableDeclaration",
                            kind: "var",
                            declarations: [
                                {
                                    type: "VariableDeclarator",
                                    id: { type: "Identifier", name: name },
                                    init: def.name
                                }
                            ]
                        });
                        
                        variable.references.forEach(reference => {
                            reference.identifier.name = name;
                        });
                    }
                });
            });
        });
    }

};
