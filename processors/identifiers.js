"use strict";

var assert = require("assert");

var _ = require("lodash");

var estest = require("../estest");
var ESUtils = require("../esutils");
var traverser = require("../traverser");
var utils = require("../utils");

module.exports = class Identifiers {

    constructor (logger) {
        this.logger = logger;
        this.esutils = new ESUtils(logger);
    }
    
    /**
     * This checks whether the given node has a parent that
     * accepts undefined children without throwing errors.
     * Those cannot be moved to separate variables without
     * causing errors by assigning undefined variables
     * to new variables.
     * @param {Node} node
     * @returns {boolean}
     */
    hasParentAcceptingUndefined (node) {
        var parent = this.esutils.getParent(node);
        return parent
            && parent.type == "UnaryExpression"
            && _.includes([ "typeof", "delete" ], parent.operator);
    }
    
    /**
     * Replace property references like obj.prop with obj["prop"].
     * @param {Node} ast Root node
     * @returns {Node} Root node
     */
    computeProperties (ast) {
        assert.ok(estest.isNode(ast));
        
        ast = traverser.traverse(ast, [], (node, stack) => {
            if (node.type == "MemberExpression"
                && !node.computed) {
                assert(node.property.type == "Identifier");
                node.property = { type: "Literal", value: node.property.name };
                node.computed = true;
            }
            
            return node;
        });
        
        return ast;
    }
    
    /**
     * Replace objects with an array via $$defendjs$toObject.
     * @param {Node} ast Root node
     * @returns {Node} Root node
     */
    arrayizeObjects (ast) {
        assert.ok(estest.isNode(ast));

        ast = traverser.traverse(ast, [], (node, stack) => {
            if (node.type == "ObjectExpression") {
                var arr = [];
                node.properties.forEach(prop => {
                    arr.push({ type: "Literal", value: prop.key.name || prop.key.value });
                    arr.push(prop.value);
                });
                return {
                    type: "CallExpression",
                    callee: { type: "Identifier", name: "$$defendjs$toObject"  },
                    arguments: [
                        {
                            type: "ArrayExpression",
                            elements: arr
                        }
                    ]
                };
            }
            
            return node;
        });
        
        return ast;
    }
    
    // This seems to be ununsed.
    // TODO: Figure this out
    moveIdentifiers (ast, scopeManager) {
        assert.ok(estest.isNode(ast));
        
        var rng = new utils.UniqueRandomAlpha(3);
        
        this.esutils.setParentsRecursive(ast);
        
        scopeManager.scopes.forEach(scope => {
            /**
             * That could cause problems if there are multiple unresolved
             * references with the same name. (is that even possible?)
             */
            
            var replaced = new utils.HashMap();
            
            scope.references
            .filter(reference => !utils.isResolvedReference(reference))
            .forEach(reference => {
                if (replaced.exists(reference.identifier.name)) {
                    reference.identifier.name = replaced.get(reference.identifier.name);
                } else if (!this.hasParentAcceptingUndefined(reference.identifier)) {
                    var name = "$$ident$" + rng.get();
                    replaced.set(reference.identifier.name, name);
                    
                    var init;
                    if (reference.identifier.name == "undefined") {
                        init = { type: "Identifier", name: "undefined" };
                    } else {
                        init = {
                            type: "ConditionalExpression",
                            test: {
                                type: "BinaryExpression",
                                operator: "!==",
                                left: {
                                    type: "UnaryExpression",
                                    operator: "typeof",
                                    prefix: true,
                                    argument: { type: "Identifier", name: reference.identifier.name }
                                },
                                right: { type: "Literal", value: "undefined" }
                            },
                            consequent: { type: "Identifier", name: reference.identifier.name },
                            alternate: { type: "Identifier", name: "undefined" }
                        };
                    }
                                        
                    this.esutils.insertIntoScope(scope, {
                        type: "VariableDeclaration",
                        kind: "var",
                        declarations: [
                            {
                                type: "VariableDeclarator",
                                id: { type: "Identifier", name: name },
                                init: init
                            }
                        ]
                    });
                    
                    reference.identifier.name = name;
                }
            });
        });
        
        return ast;
    }
    
    /**
     * Move all literals into the $$defendjs$literals array.
     * @param {Node} ast Root node
     * @param {ScopeManager} scopeManager Scope manager
     * @returns {Node} Root node
     */
    moveLiterals (ast, scopeManager) {
        assert.ok(estest.isNode(ast));
        
        var rng = new utils.UniqueRandomAlpha(3);
        
        var vars = [];
        
        ast = traverser.traverse(ast, [], (node, stack) => {
            if (node.type == "Literal" && stack.length > 0 && stack[1].node.type != "Property") {
                var idx = vars.indexOf(node.value);
                if (idx == -1) {
                    idx = vars.length;
                    vars.push(node.value);
                }
                
                return {
                    type: "MemberExpression",
                    object: { type: "Identifier", name: "$$defendjs$literals" },
                    property: { type: "Literal", value: idx },
                    computed: true
                };
            }
            
            return node;
        });
        
        ast.body.splice(0, 0, {
            type: "VariableDeclaration",
            kind: "var",
            declarations: [
                {
                    type: "VariableDeclarator",
                    id: { type: "Identifier", name: "$$defendjs$literals" },
                    init: {
                        type: "ArrayExpression",
                        elements: vars.map(x => ({ type: "Literal", value: x }))
                    }
                }
            ]
        });
        
        return ast;
    }
    
};
