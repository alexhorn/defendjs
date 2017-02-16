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
