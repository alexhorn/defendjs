#!/usr/bin/env node

if (require.main === module) {
    require("./cli").run();
} else {
    module.exports = require("./obfuscator");
}