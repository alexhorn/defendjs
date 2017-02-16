
module.exports = function (adapter) {
    
    adapter = adapter || function (level, args) {
        console.log(level + ": " + JSON.stringify(args));
    };
    
    this.log = function () {
        adapter("log", Array.prototype.slice.call(arguments));
    };
    
    this.error = function () {
        adapter("error", Array.prototype.slice.call(arguments));
    };
    
    this.warn = function () {
        adapter("warn", Array.prototype.slice.call(arguments));
    };
    
    this.info = function () {
        adapter("info", Array.prototype.slice.call(arguments));
    };
    
    this.debug = function () {
        adapter("debug", Array.prototype.slice.call(arguments));
    };
    
};
