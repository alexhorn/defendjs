"use strict";

var fs = require("fs");
var os = require("os");
var path = require("path");

var _ = require("lodash");

var defendjs = require("./obfuscator");

exports.run = function () {

    var argv = require("minimist")(process.argv.slice(2));
    if (argv.help) {
        console.info(
            "# Usage\n" +
            "\n" + 
            "defendjs --input [directory] --output [directory] --features [features] --preprocessor [variable]\n" +
            "\n" +
            "# Parameters\n" +
            "\n" +
            "--input\n" +
            "\tPath to input directory or file. Can be repeated multiple times.\n" +
            "\n" +
            "--output\n" +
            "\tPath to output directory.\n" +
            "\n" +
            "--features\n" +
            "\tComma-separated list of features. (available features: " + _.join(_.keys(defendjs.features), ", ") + ")\n" +
            "\te.g. --features scope,control_flow,compress\n" +
            "\n" +
            "--preprocessor\n" +
            "\tPreprocessor variable declaration or assignment.\n" +
            (() => { switch (os.platform()) {
                case "win32":
                    return "\te.g. --preprocessor PLATFORM_WINDOWS --preprocessor PLATFORM_WINDOWS_VERSION=10\n";
                case "darwin":
                    return "\te.g. --preprocessor PLATFORM_MACOS --preprocessor PLATFORM_MACOS_VERSION=10.12\n";
                default:
                    return "\te.g. --preprocessor PLATFORM_LINUX --preprocessor PLATFORM_LINUX_VERSION=4.8\n";
            } })() +
            "\n" +
            "# Example\n" +
            "\n" +
            (() => { switch (os.platform()) { // bit of a pointless feature, but its neat
                case "win32":
                    return "defendjs --input \"D:\\project\\src\" --output \"D:\\project\\dist\" --features scope,control_flow,compress --preprocessor PLATFORM_WINDOWS\n";
                case "darwin":
                    return "defendjs --input \"~/project/src\" --output \"~/project/dist\" --features scope,control_flow,compress --preprocessor PLATFORM_MACOS\n";
                default:
                    return "defendjs --input \"~/project/src\" --output \"~/project/dist\" --features scope,control_flow,compress --preprocessor PLATFORM_LINUX\n";
            } })() +
            "\n"
        );
        process.exit(0);
    }
    if (!Array.isArray(argv.input)) {
        argv.input = [ argv.input ];
    }
    if (!Array.isArray(argv.preprocessor)) {
        argv.preprocessor = [ argv.preprocessor ];
    }
    if (!argv.input) {
        console.error(
            "Missing --input"
        );
        process.exit(0);
    }
    if (!argv.output) {
        console.error(
            "Missing --output"
        );
        process.exit(0);
    }

    let files = [];
    argv.input.forEach(item => {
        let stat = fs.lstatSync(item);
        if (stat.isDirectory()) {
            readdirRecursiveSync(item)
                .filter(
                    file => !/(^|[\/\\])(\.git|node_modules)($|[\/\\])/.test(file)
                )
                .forEach(
                    file => files[file] = fs.readFileSync(path.join(item, file), "utf8")
                );
        } else if (stat.isFile()) {
            files[item] = fs.readFileSync(item, "utf8");
        }
    });

    let mainFiles = getMainFiles(files);

    let features = _.mapValues(defendjs.features, (value, key) => _.includes(argv.features, key));

    let preprocessorVariables = _.fromPairs(_.map(argv.preprocessor, decl => {
        let [, variable, value] = /^\s*([\w\d]+)\s*(?:=\s*([\w\d]+))?\s*$/.exec(decl) || [];
        return [variable, value || null];
    }));

    let results = _.fromPairs(_.map(mainFiles, key => {
        console.info(`Obfuscating ${key} ...`);
        return [key, defendjs.do({
            code: files[key],
            modulesCode: _.pickBy(files, (value, _key) => key != _key && isCodeFile(_key) && !mainFiles[_key]),
            features: features,
            preprocessorVariables: preprocessorVariables
        })];
    }));

    _.each(results, (result, key) => {
        let target = path.join(argv.output, key);
        if (!pathExists(path.dirname(target))) {
            fs.mkdirSync(path.dirname(target));
        }
        if (pathExists(target)) {
            fs.unlinkSync(target);
        }
        fs.writeFileSync(target, result.code);
    });

    function readdirRecursiveSync(dir) {
        let results = [];
        let files = fs.readdirSync(dir);
        files.forEach(function(file) {
            let stat = fs.statSync(dir + "/" + file);
            if (stat.isDirectory()) {
                readdirRecursiveSync(dir + "/" + file).forEach(subfile => results.push(file + "/" + subfile));
            } else {
                results.push(file);
            }
        });
        return results;
    }

    function isSourceFile(name) {
        return _.includes([ ".js", ".json" ], path.extname(name));
    }

    function isCodeFile(name) {
        return path.extname(name) == ".js";
    }

    function pathExists(path) {
        try {
            let stat = fs.lstatSync(path);
            return stat.isFile() || stat.isDirectory();
        } catch (e) {
            return false;
        }
    }

    function getMainFiles(files) {
        let _package = files["package.json"] && JSON.parse(files["package.json"]);
        if (_package && _package.defendjs && _package.defendjs.mainFiles) {
            return _package.defendjs.mainFiles;
        } else if (_package && _package.main) {
            return [ _package.main ];
        } else if (Object.keys(files).filter(isSourceFile).length == 1) {
            return [ Object.keys(files).filter(isSourceFile)[0] ];
        } else {
            return [ "app.js", "main.js", "index.js" ].filter(x => files[x] != null).slice(0, 1);
        }
    }

};
