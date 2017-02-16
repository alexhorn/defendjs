"use strict";

var _ = require("lodash");

var { Parser: Parser } = require("expr-eval");

const DEFAULT_PREPROCESSOR_VARIABLES = {
    "true": 1,
    "false": 0
};

/**
 * Generates code from an array of text nodes.
 * @param {TextNode[]} nodes
 * @returns {string}
 */
function codeFromNodeArray(nodes) {
    let lines = [];
    for (let node of nodes) {
        lines[node.line] = node.text;
    }
    return lines.join("\n");
}

/**
 * Removes shebang from beginning of code.
 * @param {string} code
 * @returns {string}
 */
function removeShebangs(code) {
    if (_.startsWith(code, "#!")) {
        code = code.split(/\r?\n/).slice(1).join("\n");
    }

    return code;
}

class ArrayUtils {
    /**
     * Replaces all occurences of an object in an array with an other object in place.
     * @param {Array} arr
     * @param {Object} oldElem
     * @param {Object} newElem 
     */
    static replace(arr, oldElem, newElem) {
        for (let i = 0; i < arr.length; ++i) {
            if (arr[i] == oldElem) {
                arr[i] = newElem;
            }
        }
    }
}

class Node {
    constructor() {

    }
    /**
     * Evaluates tree into an array of TextNodes.
     * @param {Object.<string, string>} defines Preprocessor variables
     * @returns {TextNode[]}
     */
    eval(defines) {
        throw new Error("Node.eval() can not be called directly");
    }
}

class BlockNode extends Node {
    constructor() {
        super();
        this.children = [];
    }
    eval(defines) {
        return _.flatten(this.children.map(x => x.eval(defines)));
    }
}

class TextNode extends Node {
    constructor(text) {
        super();
        this.text = text;
    }
    eval(defines) {
        return [this];
    }
}

class DefineNode extends Node {
    constructor(left, right) {
        super();
        this.left = left;
        this.right = right;
    }
    eval(defines) {
        defines[this.left] = this.right;
        return [];
    }
}

class ErrorNode extends Node {
    constructor(message) {
        super();
        this.message = message;
    }
    eval(defines) {
        throw new Error(this.message);
    }
}

class IfBlockNode extends BlockNode {
    constructor(condition) {
        super();
        this.condition = condition;
    }
    /**
     * Evaluates condition.
     * @param {Object.<string, string>} defines Preprocessor variables
     * @returns {boolean}
     */
    evalCond(defines) {
        let condition = this.condition;
        condition = condition.replace(/!defined\(([\w\d]+)\)/, (match, p1) => !defines.hasOwnProperty(p1) ? "true" : "false");
        condition = condition.replace(/defined\(([\w\d]+)\)/, (match, p1) => defines.hasOwnProperty(p1) ? "true" : "false");
        return Parser.evaluate(condition, defines);
    }
    /**
     * Evaluates node with given condition result.
     * @param {Object.<string, string>} defines Preprocessor variables
     * @returns {boolean}
     */
    evalWith(defines, result) {
        if (result) {
            return super.eval(defines);
        } else {
            return [];
        }
    }
    eval(defines) {
        return this.evalWith(defines, this.evalCond(defines));
    }
}

class ElseBlockNode extends BlockNode {
    constructor(ifNode) {
        super();
        this.ifNode = ifNode;
    }
    eval(defines) {
        if (this.ifNode.evalCond(defines)) {
            return this.ifNode.evalWith(defines, true);
        } else {
            return super.eval(defines);
        }
    }
}

module.exports = class Preprocessing {

    constructor (logger) {
        this.logger = logger;
    }
    
    /**
     * Processes preprocessor directives.
     * @param {string} code
     * @param {Object.<string, string>} preprocessorVariables
     * @returns {string} Processed code
     */
    processDirectives (code, preprocessorVariables) {
        let lines = code.split(/\r?\n/), stack = [new BlockNode()];

        let defines = {};
        _.merge(defines, DEFAULT_PREPROCESSOR_VARIABLES);
        _.merge(defines, preprocessorVariables);

        for (let i = 0; i < lines.length; ++i) {
            let line = lines[i];
            let [, directive, parameters] = /^\s*\/\/\s*#(\w+)\s*(.+)?$/.exec(line) || [];
            switch (directive) {
                case undefined: {
                    let elem = new TextNode(line);
                    elem.line = i;
                    _.last(stack).children.push(elem);
                    break;
                }
                case "define": {
                    let [, left, right] = /^\s*([\w\d]+)\s*(?:=\s*([\w\d]+))?\s*$/.exec(parameters);
                    let elem = new DefineNode(left, right);
                    elem.line = i;
                    _.last(stack).children.push(elem);
                    break;
                }
                case "error": {
                    let elem = new ErrorNode(parameters);
                    elem.line = i;
                    _.last(stack).children.push(elem);
                    break;
                }
                case "if":
                case "ifdef":
                case "ifndef": {
                    let elem =
                        directive == "if" ? new IfBlockNode(parameters) :
                        directive == "ifdef" ? new IfBlockNode(`defined(${parameters})`) :
                        directive == "ifndef" ? new IfBlockNode(`!defined(${parameters})`) :
                        null;
                    elem.line = i;
                    _.last(stack).children.push(elem);
                    stack.push(elem);
                    break;
                }
                case "else": {
                    let elem = new ElseBlockNode(stack.pop());
                    elem.line = i;
                    ArrayUtils.replace(_.last(stack).children, elem.ifNode, elem);
                    stack.push(elem);
                    break;
                }
                case "endif": {
                    let elem = stack.pop();
                    break;
                }
                default: {
                    this.logger.warn(`Unknown preprocessor directive #${directive}`);
                }
            }
        }

        if (stack.length > 1) {
            this.logger.warn("stack.length != 1 (preprocessor directive closing tag missing?)");
        }

        return codeFromNodeArray(stack[0].eval(defines));
    }

    /**
     * Does preprocessing.
     * @param {string} code
     * @param {Object.<string, string>} preprocessorVariables
     * @returns {string}
     */
    process (code, preprocessorVariables) {
        code = this.processDirectives(code, preprocessorVariables);
        code = removeShebangs(code);
        return code;
    }
    
};
