/** @module defendjs */

"use strict";

var fs = require("fs");
var assert = require("assert");

var _ = require("lodash");
var babel = require("babel-core");
var escodegen = require("escodegen");
var escope = require("escope");
var esprima = require("esprima");

var traverser = require("./traverser");
var utils = require("./utils");

var Logger = require("./logger");

var prDeadCode          = require("./processors/deadCode");
var prModules           = require("./processors/modules");
var prMethods           = require("./processors/methods");
var prVariables         = require("./processors/variables");
var prScopes            = require("./processors/scopes");
var prFlattener         = require("./processors/flattener");
var prNormalizer        = require("./processors/normalizer");
var prPreprocessing     = require("./processors/preprocessing");
var prPostprocessing    = require("./processors/postprocessing");
var prUglifier          = require("./processors/uglifier");
var prIdentifiers       = require("./processors/identifiers");
var prLiterals          = require("./processors/literals");
var prHealth            = require("./processors/health");

var defaultOptions = {
    babel: true,
    features: {
        dead_code: true,
        scope: true,
        control_flow: true,
        identifiers: true,
        literals: true,
        mangle: true,
        compress: true
    },
    logLevel: "warn",
    preprocessorVariables: {}
};

var featureDeps = {
    dead_code: [ "control_flow" ],
    scope: [ "mangle" ],
    control_flow: [ "scope", "mangle" ],
    identifiers: [ "mangle" ],
    literals: [ "scope", "mangle" ],
    compress: [ "mangle" ]
};

var featureDescs = {
    dead_code: {
        en: "Insert dead code"
    },
    scope: {
        en: "Flatten the scope (method) structure to obfuscate application structure"
    },
    control_flow: {
        en: "Flatten control flow (if, while, for, etc...) structure to obfuscate control flow"
    },
    identifiers: {
        en: "Obfuscate identifiers (variable, object and property names)"
    },
    literals: {
        en: "Obfuscate literals (numbers, strings)"
    },
    mangle: {
        en: "Shorten identifiers (variable names, function names)"
    },
    compress: {
        en: "Remove unneeded whitespace"
    }
};

exports.features = _.fromPairs(
    _.map(defaultOptions.features, (enabled, feature) =>
        [
            feature,
            {
                dependencies: featureDeps[feature] || [],
                descriptions: featureDescs[feature] || {},
                default: enabled
            }
        ]
    )
);

/**
 * Logs informational and diagnostic messages onto an output device or object.
 * 
 * @callback logAdapterCallback
 * @param {string} level - Message level.
 * @param {string} data - Message data.
 */

/**
 * Obfuscates a project.
 * @param {Object} options - Configuration.
 * @param {string} options.code - Code of entry point file to be obfuscated.
 * @param {Object.<string, string>} options.modulesCode - Code of all of options.code's depedencies.
 * @param {boolean} [options.babel = true] - Whether to run babel with ES2015 preset before obfuscating.
 * @param {Object.<string, boolean>} [options.features = All enabled] - Feature configuration.
 * @param {logAdapterCallback} [options.logAdapter = Console] - Logging adapter.
 * @param {string} [options.logLevel = "warn"] - Minimum level of shown log messages.
 * @param {Object.<string, boolean>} [options.preprocessorVariables] - Preprocessor variables.
 * @example
 * defendjs.do({
 *     code: "...",
 *     modulesCode: {
 *         depA: "...",
 *         depB: "..."
 *     },
 *     features: {
 *         scope: true,
 *         control_flow: true,
 *         identifiers: true,
 *         literals: true,
 *         mangle: true,
 *         compress: true
 *      }
 * });
 */
exports.do = function (options) {
    /**
     * Annotates potentially thrown errors with a label
     */
    function tryTag(label, task) {
        try {
            return task();
        } catch (e) {
            throw new Error(`[${label}]\t${e.stack}`);
        }
    }

    /**
     * Adapter for Logger
     */
    function createConsoleLoggingAdapter(logLevel) {
        const LEVELS = ["log", "error", "warn", "info", "debug"];
        let allowedLevels = [];
        for (let level of LEVELS) {
            allowedLevels.push(level);
            if (level == logLevel) {
                break;
            }
        }
        return (level, data) => {
            if (_.includes(allowedLevels, level)) {
                var prefix = "[task]" + Array(taskIndent).join("\t");
                console.log(`${prefix}[${level}]\t${data.join("\t")}`);
            }
        };
    }
    
    var taskIndent = 1;
    /**
     * Wraps a task, indents its output and measures its duration
     */
    function doTask(label, condition, task) {
        return tryTag(label, () => {
            taskIndent++;
            var prefix = "[task]" + Array(taskIndent).join("\t");
            try {
                if (condition) {
                    logger.info(`${prefix}${label} ...`);
                    
                    var start = Date.now();
                    task();
                    var duration = Date.now() - start;
                    logger.info(`${prefix}${label}: ${duration}ms`);
                    return {
                        otherwise: function() { }
                    };
                } else {
                    return {
                        otherwise: function (task) { task(); }
                    };
                }
            } finally {
                taskIndent--;
            }
        });
    }
    
    options = _.merge({}, defaultOptions, options); // first argument gets mutated
    if (!options.logAdapter) {
        options.logAdapter = createConsoleLoggingAdapter(options.logLevel);
    }
    if (!options.forceFeatures) {
        _.map(featureDeps, (deps, feature) => {
            if (options.features[feature]) {
                deps.forEach(dep => options.features[dep] = true);
            }
        });
    } else {
        options.features = options.forceFeatures;
    }
    
    var parseOptions = {};
    var scopeOptions = {
        optimistic: true // required or things in the global scope just get lost
    };
    
    var logger = new Logger(options.logAdapter);

    var start = Date.now();

    // Preprocess
    doTask("preprocessing", true, () => {
        var preprocessor = new prPreprocessing(logger); 
        options.modulesCode = _.mapValues(
            options.modulesCode,
            (code, key) => tryTag(key, () => preprocessor.process(code, options.preprocessorVariables))
        );
        options.code = tryTag("app", () => preprocessor.process(options.code, options.preprocessorVariables));
    });
    
    // Apply babel
    doTask("babel", options.babel, () => {
        var babelOptions = {
            "plugins": [
                "babel-plugin-transform-es2015-arrow-functions",
                //"babel-plugin-transform-es2015-block-scoped-functions",
                "babel-plugin-transform-es2015-block-scoping",
                "babel-plugin-transform-es2015-classes",
                "babel-plugin-transform-es2015-computed-properties",
                //"babel-plugin-check-es2015-constants",
                "babel-plugin-transform-es2015-destructuring",
                "babel-plugin-transform-es2015-duplicate-keys",
                "babel-plugin-transform-es2015-for-of",
                "babel-plugin-transform-es2015-function-name",
                "babel-plugin-transform-es2015-literals",
                "babel-plugin-transform-es2015-object-super",
                "babel-plugin-transform-es2015-parameters",
                "babel-plugin-transform-es2015-shorthand-properties",
                "babel-plugin-transform-es2015-spread",
                "babel-plugin-transform-es2015-sticky-regex",
                "babel-plugin-transform-es2015-template-literals",
                //"babel-plugin-transform-es2015-typeof-symbol",
                "babel-plugin-transform-es2015-unicode-regex"
            ].map(require.resolve)
        };
        options.modulesCode = _.mapValues(options.modulesCode, (moduleCode, key) => tryTag(key, () => babel.transform(moduleCode, babelOptions).code));
        options.code = tryTag("app", () => babel.transform(options.code, babelOptions).code);
    });
    
    // Parse code
    var ast, modulesAST;
    doTask("parse", true, () => {
        modulesAST = _.mapValues(options.modulesCode, (code, key) => tryTag(key, () => esprima.parse(code, parseOptions)));
        modulesAST.app = tryTag("app", () => esprima.parse(options.code, parseOptions));
    });
    
    // Merge depedencies into main modules
    doTask("merge", true, () => {
        var modules = new prModules(logger);
        ast = modules.merge(modulesAST, "app");
    });

    // Insert dead code
    doTask("dead_code", options.features.dead_code, () => {
        var deadCode = new prDeadCode();
        ast = deadCode.insert(ast, 1.0);
    });
    
    // Simplify graph
    doTask("simplify", true, () => {
        var normalizer = new prNormalizer(logger);
        ast = normalizer.simplify(ast);
    });
        
    // Move identifiers
    doTask("identifiers", options.features.identifiers, () => {
        var identifiers = new prIdentifiers(logger);
        
        ast = identifiers.computeProperties(ast);
        ast = identifiers.arrayizeObjects(ast);
        //ast = identifiers.moveIdentifiers(ast, escope.analyze(ast, scopeOptions));
        //^ why is this commented out?
        ast = identifiers.moveLiterals(ast, escope.analyze(ast, scopeOptions));
    });
    
    doTask("literals", options.features.literals, () => {
        var literals = new prLiterals(logger);
        
        literals.generateStrings(ast);
    });
    
    doTask("scope", options.features.scope, () => {
        var scopes = new prScopes(logger);
        var methods = new prMethods(logger);
    
        var rng = new utils.UniqueRandom(32768);
        
        // Make identifiers unique
        doTask("obfuscate_identifiers", true, () => {
            var variables = new prVariables(logger);
            variables.removeFunctionExpressionIds(ast);
            variables.functionDeclarationToExpression(ast, escope.analyze(ast, scopeOptions));
            variables.obfuscateIdentifiers(ast, escope.analyze(ast, scopeOptions));
            variables.redefineParameters(ast, escope.analyze(ast, scopeOptions));
        });
        
        // Move identifiers into scope objects
        doTask("create_scope_objects", true, () => {
            scopes.createScopeObjects(ast, escope.analyze(ast, scopeOptions));
        });
        
        // Calculate entry points for all methods
        var methodEntryPoints = {};
        doTask("list_methods", true, () => {
            methods.listMethods(ast).forEach(methodName => {
                methodEntryPoints[methodName] = {
                    entry: rng.get()
                };
            });
        });
        
        // Extract function declarations and expressions
        var fns;
        doTask("extract_methods", true, () => {
            var scopeManager = escope.analyze(ast, scopeOptions);
            fns = methods.extractMethods(ast);
            fns = fns.map(method => {
                var refers = methods.methodRefersToArguments(method, scopeManager);
                methods.removeFirstArguments(method, refers ? method.params.filter(x => x.name.indexOf("$$scope") == 0).length : 0);
                return methods.replaceArgumentReferences(method, true);
            });
            if (options.features.control_flow) {
                methods.replaceFunctionCalls(ast, methodEntryPoints);
                fns.forEach(method => {
                    methods.replaceFunctionCalls(method.body, methodEntryPoints);
                });
            }
        });
        
        doTask("add_custom_bind", true, () => {
            methods.addCustomBind(ast);
        });
    
        doTask("control_flow", options.features.control_flow, () => {
            // Apply control flow flattening and merge methods
            var flattener = new prFlattener(logger, rng);
            var entry = rng.get(), exit = rng.get();
            flattener.addMethod(ast, entry, exit);
            fns.forEach(method => {
                methods.bumpArgumentsIndices(method, 1);

                var entry = methodEntryPoints[method.id.name].entry;
                flattener.addMethod(method.body, entry, exit);
            });
            
            ast = flattener.getProgram(entry, exit);
            
            ast = flattener.unifyPrefixStatements(ast);
        })
        .otherwise(() => {
            if (ast.type == "Program") {
                ast.type = "BlockStatement";
            }
            ast = {
                type: "Program",
                body: fns.concat([ ast ])
            };
        });
    });
    
    // Postprocessing
    doTask("postprocessing", true, () => {
        var postprocessing = new prPostprocessing(logger);
        ast = postprocessing.do(ast);
    });
    
    doTask("health", options.features.health, () => {
        var health = new prHealth(logger);
        ast = health.check(ast);
    });
    
    doTask("mangle", options.features.mangle, () => {
        var uglifier = new prUglifier(logger);
        if (ast.type == "Program") {
            ast.type = "BlockStatement";
        }
        ast = uglifier.uglify({
            type: "Program",
            body: [
                {
                    type: "CallExpression",
                    arguments: [],
                    callee: {
                        type: "FunctionExpression",
                        params: [],
                        body: ast
                    }
                }
            ]
        });
    });
    
    var codegenOptions = {
        sourceMap: false,
        sourceMapWithCode: false
    };
    
    doTask("compress", options.features.compress, () => {
        codegenOptions.format = {
            renumber: true,
            hexadecimal: true,
            quotes: "auto",
            compact: true
        };
    });
    
    var result = escodegen.generate(ast, codegenOptions);

    var duration = Date.now() - start;
    
    return {
        code: result.code || result,
        map: result.map && result.map.toString()
    };
};

