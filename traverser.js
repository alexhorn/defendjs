"use strict";

var assert = require("assert");

var estraverse = require("estraverse");

var estest = require("./estest");
var utils = require("./utils");

// Depth-first
exports.traverse = function (node, stack, processor) {
    assert.ok(estest.isNode(node));
    assert.ok(Array.isArray(stack));
    assert.equal(typeof processor, "function");
    
    exports.visitChildren(node, (child, key) => {
        return exports.traverse(child, [ { node: node, key: key } ].concat(stack), processor);
    });
    
    return processor(node, [ { node: node } ].concat(stack));
};

// Breadth-first
exports.traverseEx = function (node, stack, processor) {
    assert.ok(estest.isNode(node));
    assert.ok(Array.isArray(stack));
    assert.equal(typeof processor, "function");
    
    var abort = false;
    var controller = {
        abort: function() {
            abort = true;
        }
    };
    
    var queue = [];
    exports.visitChildrenEx(node, (child, key) => {
        var repl = processor.call(controller, child, [ { node: node } ].concat(stack));
        if (repl == child) {
            queue.push({
                child: child,
                key: key
            });
        }
        return repl;
    });
    if (!abort) {
        queue.every(elem => {
            exports.traverseEx.call(controller, elem.child, [ { node: node, key: elem.key } ].concat(stack), processor);
            return !abort;
        });
    }
    return node;
};

exports.visitChildren = function (node, processor) {
    assert.ok(estest.isNode(node));
    assert.equal(typeof processor, "function");
    
    var keys = estraverse.VisitorKeys[node.type] || [];
    keys.forEach(key => {
        if (Array.isArray(node[key])) {
            node[key] = node[key].map(x => {
                var repl = processor(x, key);
                assert(repl);
                return repl;
            });
        } else if (node[key]) {
            var repl = processor(node[key], key);
            assert(repl);
            node[key] = repl;
        }
    });
};

exports.visitChildrenEx = function (node, processor) {
    assert.ok(estest.isNode(node));
    assert.equal(typeof processor, "function");
    
    var keys = estraverse.VisitorKeys[node.type] || [];
    keys.forEach(key => {
        if (Array.isArray(node[key])) {
            let i = node[key].length;
            while (i--) {
                assert(node[key][i]);
                let replacement = processor(node[key][i], key);
                assert(replacement);
                if (replacement.length == 1) {
                    replacement = replacement[0];
                }
                if (Array.isArray(replacement)) {
                    utils.splice(node[key], i, 1, replacement);
                } else {
                    node[key][i] = replacement;
                }
            }
        } else if (node[key]) {
            let replacement = processor(node[key], key);
            assert(replacement);
            if (replacement.length == 1) {
                replacement = replacement[0];
            }
            if (Array.isArray(replacement)) {
                throw new Error("Cannot use array here: " + node.type + "." + key + "\n" + JSON.stringify(node) + "\n" + JSON.stringify(replacement));
            } else {
                node[key] = replacement;
            }
        }
    });
};
