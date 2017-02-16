"use strict";

var assert = require("assert");

var _ = require("lodash");
var estest = require("../estest");
var traverser = require("../traverser");
var utils = require("../utils");

const KEYWORDS = ["await","break","case","catch","class","const","continue","debugger","default","delete","do","else","enum","export","extends","finally","for","function","if","implements","import","in","instanceof","interface","let","new","package","private","protected","public","return","static","super","switch","this","throw","try","typeof","var","void","while","with","yield"];

module.exports = class DeadCode {

    constructor (logger) {
        this.logger = logger;
    }
    
    /**
     * Insert dead code
     * @param {Node} ast
     * @returns {Node}
     */
    insert (ast, probability) {
        assert.ok(estest.isNode(ast));

        var rngAlpha = new utils.UniqueRandomAlpha(3);

        return traverser.traverse(ast, [], (node, stack) => {
            if (node.type == "BlockStatement") {
                for (var i = 0; i < probability; ++i) {
                    if (probability - i < Math.random()) {
                        continue;
                    }

                    var pos = utils.random(0, node.body.length - 1);
                    var len = utils.random(1, node.body.length - pos);

                    var varValue = _.sample(KEYWORDS);

                    var spliced = node.body.splice(pos, len);
                    node.body.splice(pos, 0,
                        {
                            type: "IfStatement",
                            test: {
                                type: "BinaryExpression",
                                operator: "==",
                                left: { type: "Literal", value: varValue },
                                right: { type: "Literal", value: varValue }
                            },
                            consequent: {
                                type: "BlockStatement",
                                body: spliced
                            }
                        }
                    );
                }
            }
            return node;
        });
    }
    
};
