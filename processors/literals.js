"use strict";

var assert = require("assert");

var _ = require("lodash");

var estest = require("../estest");
var traverser = require("../traverser");
var utils = require("../utils");

/**
 * Generate string generator from string.
 * @param {string} str
 * @returns {Node}
 */
function makeStringGenerator(str) {
    assert.equal(typeof str, "string");
    
    var fragments = [];
    
    while (str.length > 0) {
        var len = utils.random(1, 5);
        fragments.push(str.substring(0, len));
        str = str.substring(len);
    }
    
    var block = {
        type: "BlockStatement",
        body: [
            {
                type: "VariableDeclaration",
                kind: "var",
                declarations: [
                    {
                        type: "VariableDeclarator",
                        id: { type: "Identifier", name: "str" },
                        init: { type: "Literal", value: "" }
                    }
                ]
            }
        ]
    };
    
    fragments.forEach(fragment => {
        var decoded = makeStringByteArrayCall(fragment);
        
        block.body.push({
            type: "ExpressionStatement",
            expression: {
                type: "BinaryExpression",
                operator: "+=",
                left: { type: "Identifier", name: "str" },
                right: decoded
            }
        });
    });
    
    block.body.push({
        type: "ReturnStatement",
        argument: { type: "Identifier", name: "str" }
    });
    
    return {
        type: "CallExpression",
        arguments: [],
        callee: {
            type: "FunctionExpression",
            params: [],
            body: block
        }
    };
}

/**
 * Generate unicode-escaped string generator from string.
 * @param {string} str
 * @returns {Node}
 */
function makeStringUnicode(str) {
    assert.equal(typeof str, "string");
    
    return {
        type: "CallExpression",
        callee: { type: "Identifier", name: "eval" },
        arguments: [
            {
                type: "Literal",
                value: "\"" + str.split("").map(x => "\\x" + x.charCodeAt().toString(16)).join("") + "\""
            }
        ]
    };
}

/**
 * Generate URL-escaped string generator from string.
 * @param {string} str
 * @returns {Node}
 */
function makeStringUnescape(str) {
    assert.equal(typeof str, "string");
    
    return {
        type: "CallExpression",
        callee: { type: "Identifier", name: "unescape" },
        arguments: [
            {
                type: "Literal",
                value: str.split("").map(x => "%" + x.charCodeAt().toString(16)).join("")
            }
        ]
    };
}

/**
 * Generate char-code-escaped char generator from char.
 * @param {string} cha
 * @returns {Node}
 */
function makeCharByte(cha) {
    assert.equal(typeof cha, "string");
    assert.equal(cha.length, 1);
    
    return {
        type: "CallExpression",
        callee: {
            type: "MemberExpression",
            computed: false,
            object: { type: "Identifier", name: "String" },
            property: { type: "Identifier", name: "fromCharCode" }
        },
        arguments: [
            {
                type: "Literal",
                value: cha.charCodeAt(0)
            }
        ]
    };
}

/**
 * Generate char-code-escaped string generator from string.
 * @param {string} str
 * @returns {Node}
 */
function makeStringByteArrayCall(str) {
    assert.equal(typeof str, "string");
    
    return {
        type: "CallExpression",
        callee: { type: "Identifier", name: "$$defendjs$fromCharCodes" },
        arguments: str.split("").map(x => ({ type: "Literal", value: x.charCodeAt() }))
    };
}

module.exports = class Literals {

    constructor (logger) {
        this.logger = logger;
    }
    
    /**
     * Move strings into $$strings array
     * @param {Node} ast Root node
     * @returns {Node} Root node
     */
    extractStrings (ast) {
        assert.ok(estest.isNode(ast));
        
        var global = { type: "Identifier", name: "$$strings" };
        
        var strings = [];
        var stringMap = {};
        
        ast = traverser.traverse(ast, [], (node, stack) => {
            if (node.type == "Literal" && typeof node.value == "string") {
                var idx = stringMap["_" + node.value];
                if (!idx) {
                    stringMap["_" + node.value] = idx = strings.length;
                    strings.push(node);
                }
                
                return {
                    type: "MemberExpression",
                    computed: true,
                    object: global,
                    property: { type: "Literal", value: idx }
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
                    id: global,
                    init: {
                        type: "ArrayExpression",
                        elements: strings
                    }
                }
            ]
        });
        
        return ast;
    }

    /**
     * Replace string literals with string generators.
     * @param {Node} ast Root node
     * @returns {Node} Root node
     */
    generateStrings (ast) {
        assert.ok(estest.isNode(ast));
        
        ast = traverser.traverse(ast, [], (node, stack) => {
            if (node.type == "Literal"
                && typeof node.value == "string"
                && stack.length > 1
                && stack[1].node.type != "Property") {
                return makeStringGenerator(node.value);
            }
            
            return node;
        });
        
        return ast;
    }
    
};
