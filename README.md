# defendjs
defendjs is a free and open-source JavaScript and Node.js obfuscator (not just a mangler or minifier).

Huge thanks to [Nikolai Kolodziej](https://github.com/n-kolodziej) for his support and work on the website.

## Usage
Install defendjs globally by running `npm install -g https://github.com/alexhorn/defendjs.git`.

You can run `defendjs --help` to display the help:
```
# Usage

defendjs --input [directory] --output [directory] --features [features] --preprocessor [variable]

# Parameters

--input
        Path to input directory or file. Can be repeated multiple times.

--output
        Path to output directory.

--features
        Comma-separated list of features. (available features: dead_code, scope, control_flow, identifiers, literals, mangle, compress)
        e.g. --features scope,control_flow,compress

--preprocessor
        Preprocessor variable declaration or assignment.
        e.g. --preprocessor PLATFORM_WINDOWS --preprocessor PLATFORM_WINDOWS_VERSION=10

# Example

defendjs --input "D:\project\src" --output "D:\project\dist" --features scope,control_flow,compress --preprocessor PLATFORM_WINDOWS
```

To obfuscate your first project, create a folder (e.g. `myproject`) and a `package.json` inside:
```
{
    "name": "hello-world",
    "main": "myapp.js"
}
```

Place your JavaScript code in `myapp.js` (as defined in `package.json`):
```
document.onload = function() {
    hello("World");
};

function hello(str) {
    var msg;
    if (str != null) {
        msg = "Hello, " + str + "!";
    } else {
        msg = "*crickets*";
    }
    alert(msg);
}
```

Obfuscate your app by running defendjs as follows: `defendjs --input myproject --output myproject_obfuscated --features=control_flow,literals,mangle,compress`

If everything went well, there should now be a `myproject_obfuscated` folder in your working directory.

## Obfuscated example
```
document.onload = function() {
    hello("World");
};

function hello(str) {
    var msg;
    if (str != null) {
        msg = "Hello, " + str + "!";
    } else {
        msg = "*crickets*";
    }
    alert(msg);
}
```
becomes
```
(function(){function a(f,g){var b=new Array(3);;var d=arguments;while(true)try{switch(f){case 156:return;case 22289:d[1][0](e(a,13835,b,d[1])());f=156;break;case 18269:b[2]=d[2];if(b[2]!=null){b[3]=e(a,6999,b,d[1])()+b[2]+e(a,15827,b,d[1])();}else{b[3]=e(a,20220,b,d[1])();}alert(b[3]);f=156;break;case 13835:b[1]='';b[1]+=c(87,111,114,108);b[1]+=c(100);return b[1];case 23638:function k(a,b){return Array.prototype.slice.call(a).concat(Array.prototype.slice.call(b));}function e(){var a=arguments[0],c=Array.prototype.slice.call(arguments,1);var b=function(){return a.apply(this,c.concat(Array.prototype.slice.call(arguments)));};b.prototype=a.prototype;return b;}function h(a,b){return Array.prototype.slice.call(a,b);}function i(b){var c={};for(var a=0;a<b.length;a+=2){c[b[a]]=b[a+1];}return c;}function j(a){return a.map(function(a){return String.fromCharCode(a&~0>>>16)+String.fromCharCode(a>>16);}).join('');}function c(){return String.fromCharCode.apply(null,arguments);}b[0]=e(a,18269,b);document.onload=e(a,22289,b);f=156;break;case 6999:b[1]='';b[1]+=c(72,101,108,108);b[1]+=c(111);b[1]+=c(44);b[1]+=c(32);return b[1];case 15827:b[1]='';b[1]+=c(33);return b[1];case 20220:b[1]='';b[1]+=c(42,99,114);b[1]+=c(105,99,107);b[1]+=c(101,116,115);b[1]+=c(42);return b[1];}}catch(a){$$defendjs$tobethrown=null;switch(f){default:throw a;}}}a(23638,{});}())
```

## Advanced Usage
If your project requires multiple output files, e.g. because it runs as multiple node processes running multiple scripts, you can add a directive in the `package.json` page to create a separate output file for every main file:
```
{
    "name": "hello-world",
    "defendjs": {
        "mainFiles": [ "first.js", "second.js" ]
    }
}
```

Alternatively you can check out the JavaScript API [here](https://defendjs.com/static/doc/module-defendjs.html).

## License
defendjs is licensed under the [GNU Affero General Public License v3.0](LICENSE).
