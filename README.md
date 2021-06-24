# Apps Script Package Manager
Apps Script Package Manager is a JavaScript library for Apps Script that adds support for local and external packaged libraries from [cdnjs](https://cdnjs.com/), which is an open source CDN for javascript packages. This is specially useful as Apps Script doesn't support modules.

The syntax is based on ComonJS which means most packages should just work. It also supports installing the packages into a project so there is no need to download each time.

⚠ This project is under development. Syntax may change in the future. See more known fallbacks at the end.

## How to use it
### Add ASPM as a Apps Script Library
Add the library `1M5wPqMU9dQgD0cIfCzadNhVdVJ2_7hS3PmGZnRXxjudlPYV8eud35bRl` to your project. You can change its name but I'll be using the default (`ASPM`) for this how-to.

### Setting the manager up
Create a new JavaScript file called `packages` and paste:
```js
ASPM.setup(globalThis, {
  pkgs: [
    // Define packages to import
  ]
})
```

`setup` adds the necessary objects and functions to the global object, allowing us to use them anywhere. thus, this must be the first file on your project.

You can add the dependencies that you'll use. There are 2 types:
 1. From cdnjs (name, version, file)
 1. Directly from source (name, url)

```js
ASPM.setup(globalThis, {
  pkgs: [
    new ASPM.Cdnjs({
      name: 'mathjs',
      version: '9.4.3',
      file: 'math.min.js',
    }),
    // OR
    new ASPM.Source({
      name: 'mathjs',
      url: 'https://cdnjs.cloudflare.com/ajax/libs/mathjs/9.4.3/math.min.js',
    }),
  ]
})
```

### Using the libraries
To use the library simply call `require` to get it.
```js
function myFunction() {
  const mathjs = require('mathjs')
  // use it as you see fit
}
```

### Using local modules
You can export another file by assigning things to `module.exports`. To retrieve, use a relative path (without the extension):
`myLib.gs`
```js
module.exports = {
  test() {
    return 420
  }
}
```

`code.js`
```js
function myFunction() {
  const myLib = require('./myLib')
  console.log(myLib.test()) // outputs 420
}
```

Note that you don't need to add anything to setup, as this is not an external dependency.

## Installing the packages to a library
This library allows you to create a new Apps Script library that contains all the external code. This cuts down on Quota usage and can have performance increases.

The way this works is that if you have the original library (the one from this project) linked, it creates a copy that will also contain a code of all the libraries that you defined with `setup`. It can also update the library code and all the dependencies.

To do that you'll need to have GCP project with Apps Script API enabled, and the Apps Script should have it assigned.

Add to `packages.gs`:
```js
function install() {
  ASPM.install({ fromBaseProject: true })
}
```

`fromBaseProject` is used to specify how to get the plugin's code from. This is useful to update it automatically.

## Known pitfalls
### V8 only
this project relies on multiple features of the V8 runtime, which have no equivalent on Rhino.

### Apps Script built-ins
Apps Script doesn't all the built-in objects and classes that one may expect. That may cause libraries to break.

### Too much time to load
Each library take lime to install and/or load. Having too many of them may force Apps Script to stop the execution.

### Not fully featured
This library doesn't fully cover all the CommonJS functionality. This means that some libraries may not work. If that's the case, let me know :)

## License
This project is under MIT license.
