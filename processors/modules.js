"use strict";

var assert = require("assert");
var path = require("path");

var _ = require("lodash");
var escope = require("escope");

var estest = require("../estest");
var traverser = require("../traverser");
var ESUtils = require("../esutils");
var utils = require("../utils");

/**
 * Transform calls to require().
 * @param {Node} node Root node
 * @param {Function} processor Transformer
 * @returns {Node} Root node
 */
function findRequires(node, processor) {
    assert.ok(estest.isNode(node));
    assert.equal(typeof processor, "function");
    
    return traverser.traverse(node, [], (node, stack) => {
        if (node.type == "CallExpression" && node.callee.type == "Identifier" && node.callee.name == "require") {
            return processor(node, stack);
        } else {
            return node;
        }
    });
}

/**
 * Split path into parts.
 * @param {string} path
 * @returns {string[]}
 */
function splitPath(path) {
    return path.split(/[\/\\]/g).filter(x => x != null && x.length > 0);
}

/**
 * Normalize path.
 * @param {string[]} path
 * @returns {string}
 */
function normalizePath(path) {
    var parts = splitPath(path);
    
    for (var i = parts.length - 1; i >= 0; --i) {
        if (parts[i] == "" || parts[i] == ".") {
            parts.splice(i, 1);
        } else if (parts[i] == "..") {
            parts.splice(i - 1, 2);
        }
    }
    
    return parts.join("/");
}

/**
 * Get directory from path.
 * @param {string} path
 * @returns {string}
 */
function getPathDir(path) {
    return splitPath(path).slice(0, -1).join("/");
}

/**
 * Resolve path.
 * TODO: This doesnt work as expected when path starts with a slash. Fix this.
 * @param {string} curr Executing script
 * @param {string} path Path
 * @returns {string}
 */
function resolvePath(curr, path) {
    return normalizePath(getPathDir(curr) + "/" + path);
}

module.exports = class Modules {

    constructor (logger) {
        this.logger = logger;
        this.esutils = new ESUtils(logger);
    }

    /**
     * Replace references to exports and module.exports.
     * @param {Node} ast Root node
     * @param {Node} replacement Replacement
     * @returns {Node} Root node
     */
    replaceExportsReferences (ast, replacement) {
        this.esutils.setParentsRecursive(ast);
        
        var scopeManager = escope.analyze(ast, { optimistic: true });
        
        scopeManager.scopes.forEach(scope => {
            scope.references
            .filter(reference => !utils.isResolvedReference(reference))
            .forEach(reference => {
                var parent = reference.identifier.$$defendjs$parent;
                
                if (reference.identifier.name == "exports") {
                    this.esutils.replaceNode(ast, reference.identifier, utils.cloneISwearIKnowWhatImDoing(replacement));
                } else if (
                    parent.type == "MemberExpression"
                    && (parent.object.type == "Identifier" && parent.object.name == "module")
                    && ((parent.property.type == "Identifier" && parent.property.name == "exports") || (parent.property.type == "Literal" && parent.property.value == "exports"))
                ) {
                    this.esutils.replaceNode(ast, parent, utils.cloneISwearIKnowWhatImDoing(replacement));
                }
            });
        });
        
        return ast;
    }
    
    /**
     * Merges multiple modules into a single main module.
     * @param {Object.<string, Node>} modules Module dictionary
     * @param {string} mainKey Main module key
     * @param {ScopeManager} scopeManager Scope manager
     * @returns {Node} Transformed root node
     */
    merge (modules, mainKey, scopeManager) {
        assert.ok(Object.keys(modules).length > 0);
        assert.equal(typeof mainKey, "string");
        
        modules = _.mapKeys(modules, (value, key) => normalizePath(key));
        mainKey = normalizePath(mainKey);
        
        var declaration = {
            type: "VariableDeclaration",
            kind: "var",
            declarations: []
        };
        var embeds = [];
        
        var rng = new utils.UniqueRandomAlpha(3);
        
        var processedModules = {};
        
        var requiresOrder = [];
        
        function walkDeps(key, stack) {
            stack = stack || [];
            
            findRequires(modules[key], node => {
                var path = node.arguments.length > 0 && node.arguments[0].value;

                if (!path) {
                    return node;
                }
                
                if (![ "/", "./", "../" ].some(x => path.indexOf(x) == 0)) {
                    return node;
                }
                
                path = resolvePath(key, path);
                
                if (path.slice(-3) == ".js") {
                    path = path.slice(0, -3);
                }
                
                if (!modules[path]) {
                    path = path + ".js";
                }
                
                requiresOrder.push(path);
                
                var _module = modules[path];
                if (!_module) {
                    this.logger.warn(`Local module not found: ${path}`);
                    return node;
                }
                
                if (stack.indexOf(path) == -1) {
                    walkDeps.call(this, path, stack.concat(path));
                } else {
                    this.logger.warn("Skipping cyclic depedency: " + path);
                }
                
                if (!processedModules[path]) {
                    var id = processedModules[path] = "$$module$" + rng.get();
                
                    declaration.declarations.push({
                        type: "VariableDeclarator",
                        id: { type: "Identifier", name: id },
                        init: { type: "ObjectExpression", properties: [] }
                    });
                    
                    _module = this.replaceExportsReferences(_module, { type: "Identifier", name: id });
                    
                    embeds.push({
                        type: "ExpressionStatement",
                        expression: {
                            type: "CallExpression",
                            callee: {
                                type: "FunctionExpression",
                                params: [
                                ],
                                body: {
                                    type: "BlockStatement",
                                    body: _module.body
                                }
                            },
                            arguments: [
                                
                            ]
                        },
                        $$defendjs$module: path
                    });
                }
                
                return { type: "Identifier", name: processedModules[path] };
            });
        }
        // Method has to be called via .call because otherwise this is not being passed correctly for some reason
        walkDeps.call(this, mainKey);
        
        // Check whether the VariableDeclaration contains VariableDeclarators, because an empty VariableDeclaration causes errors
        if (declaration.declarations.length > 0) {
            modules[mainKey].body = [ declaration ].concat(embeds).concat(modules[mainKey].body);
        }
        
        return modules[mainKey];
    }

};
