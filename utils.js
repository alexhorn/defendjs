"use strict";

var assert = require("assert");

var _ = require("lodash");
var escodegen = require("escodegen");
var esprima = require("esprima");

var traverser = require("./traverser");

exports.splice = function (arr, pos, del, elems) {
    Array.prototype.splice.apply(arr, [ pos, del ].concat(elems));
};

exports.unshift = function (arr, arr2) {
    if (Array.isArray(arr2)) {
        Array.prototype.unshift(arr, arr2);
    } else {
        arr.push(arr2);
    }
};

exports.push = function (arr, arr2) {
    if (Array.isArray(arr2)) {
        Array.prototype.push.apply(arr, arr2);
    } else {
        arr.push(arr2);
    }
};

exports.array = function (obj) {
    return Array.isArray(obj) ? obj : [ obj ];
};

exports.cloneISwearIKnowWhatImDoing = function (obj) {
    return JSON.parse(JSON.stringify(obj));
};

/**
 * Generate a random number.
 * @param {number} Inclusive minimum
 * @param {number} Inclusive maximum
 * @returns {number}
 */
exports.random = function (minimum, maximum) {
    return Math.floor(Math.random() * (maximum - minimum)) + minimum;
};

exports.randomAlpha = function (length) {
    var text = "";
    var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

    for (var i=0; i < length; i++) { 
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }

    return text;
};

exports.isResolvedReference = function (reference) {
    return reference.resolved != null
        && reference.resolved.defs != null
        && reference.resolved.defs.length > 0;
};

exports.UniqueRandom = function(max) {
    assert(typeof max == "number");
    if (max > 32768) {
        console.warn(`Allocating large (${max}) UniqueRandom instance`);
    }
    var arr = _.shuffle(_.range(max));
    var idx = 0;
    
    this.get = function() {
        if (idx < max) {
            return arr[idx++];
        } else {
            throw new Error("No numbers left");
        }
    };
};

exports.UniqueRandomAlpha = function (len) {
    assert(typeof len == "number");
    var offset = Math.pow(32, len - 1);
    var rng = new exports.UniqueRandom(offset * 31);
    
    this.get = function() {
        return (offset + rng.get()).toString(32);  
    };
};

exports.HashMap = function () {
    var store = {};
    
    this.get = function (key) {
        return store["HashMap" + key];
    };
    
    this.set = function (key, value) {
        return store["HashMap" + key] = value;
    };
    
    this.exists = function (key) {
        return store["HashMap" + key] !== undefined;
    };
    
    this.remove = function (key) {
        delete store["HashMap" + key];
    };
};

exports.hash = function (obj) {
    if (obj == null) {
        return "x";
    }
    
    if (typeof obj == "string") {
        return "s" + obj;
    }
    
    if (typeof obj == "number") {
        return "n" + obj.toString();
    }
    
    if (!obj.$$hash) {
        Object.defineProperty(obj, "$$hash", {
            configurable: false,
            enumerable: false,
            value: "o" + exports.randomAlpha(8)
        });
    }
    
    return obj.$$hash;
};
