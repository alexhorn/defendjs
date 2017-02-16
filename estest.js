"use strict";

var assert = require("assert");

var _ = require("lodash");

const EXPRESSIONS = [
    "Identifier"
];

const COMPOUND_STATEMENTS = [
    "BlockStatement",
    "WithStatement",
    "IfStatement",
    "SwitchStatement",
    "TryStatement",
    "WhileStatement",
    "DoWhileStatement",
    "ForStatement",
    "ForInStatement"
];

exports.isNode = function (x) {
    return x.type != null;
};

exports.isStatement = function (x) {
    assert.ok(exports.isNode(x));
    
    return x.type == "Program" || _.endsWith(x.type, "Statement") || _.endsWith(x.type, "Declaration");
};

exports.isCompoundStatement = function (x) {
    assert.ok(exports.isNode(x));
    
    return _.includes(COMPOUND_STATEMENTS.indexOf, x.type);
};

exports.isExpression = function (x) {
    assert.ok(exports.isNode(x));
    
    return _.includes(EXPRESSIONS, x.type) || _.endsWith(x.type, "Expression");
};

exports.isFunction = function (x) {
    assert.ok(exports.isNode(x));
    
    return _.startsWith(x.type, "Function");
};
