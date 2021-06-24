Object.assign(globalThis, (function() {
  /*
   * Object that contains all the modules.
   */
  const modules = {}

  /*
    * Script ID of the file that this comes from. Used for updating the code if necessary.
    */
  const BASE_SCRIPT_ID = '1M5wPqMU9dQgD0cIfCzadNhVdVJ2_7hS3PmGZnRXxjudlPYV8eud35bRl'


  /*
    * Get the name of the currently executed file name. With the attribute you may control which
    * the file is from. This is because libraries do not share same stack as the main project.
    * @param projectGlobal {!Object} Global object of the project to get the current file of.
    * @returns {string} The name of the file that's being executed.
    */
  const getCurrentFile = function(projectGlobal) {
    // WARNING: This code abuses very engine-specific behavior.
    //
    // It works by generating an error on the project's context by evaluating using the specified project's Function
    // class, which then is executed on that project stack. The it reads the Error stack (the property and its format
    // are engine specific). Then we use a regular expression to extract the name of the file.
    //
    // If anything of this changes it will break. Do not use this code outside Apps Script.
    const stack = new projectGlobal.Function(`return new Error().stack`)()
    const callerLine = stack.split(/\r?\n/)[2] // 0 is Error, 1 is the eval trick, 2 where this is called from
    return /\(?(\S+):\d+:\d+\)?$/m.exec(callerLine)[1]
  }



  function setRequire(global) {
    /*
      * Generates a key from the imported module. Adds support for relative imports.
      * @param str Name of the required module
      * @returns The module's key
      */
    const getModuleKey = str => {
      if (!str.startsWith('.')) {
        return str
      } else {
        const parts = str.split('/')
        const result = getCurrentFile(global).split('/')
        result.pop() // remove the path starts from the folder
        for (let p of parts) {
          if (p === '..') {
            result.pop()
          } else if (p !== '.') {
            result.push(p)
          }
        }
        return `/${result.join('/')}`
      }
    }
    /**
      * Require function to import modules to the code.
      */
    const require = function(module) {
      const key = getModuleKey(module)
      if (!(key in modules))
        throw new Error(`Module "${module}" has not been registred.`)
      return modules[key]
    }
    Object.assign(global, { require })
  }

  const fetch = function(url) {
    return UrlFetchApp.fetch(url).getContentText()
  }
  /*
    * Makes a Google API request.
    * @param {string} url Url of the method
    * @param {!Object} options Options see UrlFetch options
    * @returns {!Object} The parsed response of the Google API
    */
  const api = function(url, options={}) {
    const o = {
      ...options,
      headers: {
        'Authorization': `Bearer ${ScriptApp.getOAuthToken()}`,
        ...options.headers,
      },
      muteHttpExceptions: true,
    }

    if (options.payload) {
      Object.assign(o, {
        contentType: 'application/json;charset=UTF-8',
        payload: JSON.stringify(options.payload),
      })
    }

    const response = UrlFetchApp.fetch(url, o)
    const json = JSON.parse(response.getContentText())
    if (response.getResponseCode() >= 400 && options.muteHttpExceptions !== false) {
      console.error(JSON.stringify(json, null, 2))
      throw new Error(`API error.`)
    } else {
      return json
    }
  }
  api.post = function(url, payload) {
    return api(url, { method: 'POST', payload })
  }
  api.put = function(url, payload) {
    return api(url, { method: 'PUT', payload })
  }

  /**
    * Installs all the packages to the Apps Script project itself.
    * This requires to download the
    */
  function install() {
    throw new Error(`Please use setup before install.`)
  }

  /**
    * Sets up the package system with the following apckages.
    * @param globalThat Global object of the other project
    * @param param1 package dfinition
    */
  function setup(globalThat, {pkgs=[]}={}) {
    //
    // Add functions to the project's global
    //

    /**
      * Module object that allows CommonJS registration.
      */
    const module = Object.freeze({
      set exports(value) {
        const file = getCurrentFile(globalThat)
        // TODO modify name to be more module-like
        const key = `/${file}`

        if (key in modules)
          throw new Error(`Module "${key}" is already registered.`)

        modules[key] = value
      },
    })
    Object.assign(globalThat, { module, exports: {} })
    setRequire(globalThat)

    //
    // Import packages
    //
    for (let pkg of pkgs) {
      pkg._install()
    }

    //
    // Update project for cache
    //
    Object.assign(globalThis, {
      install({ fromBaseProject: from = null }={}) {
        const doInstall = installWithModules.bind(this, pkgs)

        console.info(`Install: getting information`)

        // Get this librarie's reference and ID
        const libUserSymbol = Object.keys(globalThat).find(k => globalThat[k].setup === setup)
        const baseProjectId = ScriptApp.getScriptId()
        const { files } = api(`https://script.googleapis.com/v1/projects/${baseProjectId}/content`)
        const manifestFile = files.find(f => f.type === 'JSON')
        const manifest = JSON.parse(manifestFile.source)
        const thisLib = manifest.dependencies.libraries.find(l => l.userSymbol === libUserSymbol)

        // Create new library if necessary
        let target = thisLib.libraryId
        if (target === BASE_SCRIPT_ID) {
          console.info(`Install: creating new project`)
          const { scriptId } = api.post(`https://script.googleapis.com/v1/projects/`, { title: libUserSymbol })
          target = scriptId
        }

        console.info(`Install: downloading files`)
        // install packages to the cache
        if (from === true) {
          doInstall(BASE_SCRIPT_ID, target)
        } else if (from) {
          doInstall(from, target)
        } else {
          doInstall(thisLib.libraryId, target)
        }

        console.info(`Install: linking new library`)
        // If a new library was created, link it
        if (thisLib.libraryId !== target) {
          thisLib.libraryId = target
          manifestFile.source = JSON.stringify(manifest, null, 2)
          api.put(`https://script.googleapis.com/v1/projects/${baseProjectId}/content`, { files })
        }

        console.info(`Install: Done`)
      }
    })
  }
  const installWithModules = function(pkgs, src, dest) {
    const { files } = api(`https://script.googleapis.com/v1/projects/${src}/content`)
    const cleanUp = ({ name, type, source }) => ({ name, type, source })
    const newFiles = [
      // appsscript.json (manifest)
      cleanUp(files[0]),
      // __package_management.gs (this file)
      cleanUp(files.find(({name}) => name === '__package_management')),
      // The packages downloaded (cache)
      ...pkgs.map(pkg => ({
        name: pkg.name,
        type: 'SERVER_JS',
        source: pkg._getSourceCached(),
      }))
    ]
    api.put(`https://script.googleapis.com/v1/projects/${dest}/content`, {
      files: newFiles
    })
  }

  //
  // PACKAGE CACHE
  //
  let currentPackage = null
  const module = Object.freeze({
    set exports(value) {
      const key = currentPackage ? currentPackage.name : getCurrentFile(globalThis)
      if (key in modules)
        throw new Error(`Module "${key}" is already registered.`)
      modules[key] = value
    },
  })
  Object.assign(globalThis, { module, exports: {} })

  //
  // PACKAGE INSTALATION
  //
  class AbstractSource {
    constructor(name) {
      if (!name)
        throw new Error(`A name is required to use Cdnjs.`)

      this.name = name
      this.source = null
    }

    getSource(){ throw new Error(`"install" method not implemented.`) }

    _getSourceCached() {
      if (this.source === null) {
        this.source = this.getSource()
      }
      return this.source
    }
    _install() {
      const {name} = this
      if (name in modules)
        return

      currentPackage = this
      new Function(this._getSourceCached())()
      currentPackage = null
    }
  }

  class Cdnjs extends AbstractSource {
    constructor({ name, version, file }={}) {
      super(name)
      this.version = version
      this.file = file
    }

    getSource() {
      const { name, version, file } = this
      if (name in modules)
        return

      if (this.version) {
        if (!file) {
          const { files } = JSON.parse(fetch(`https://api.cdnjs.com/libraries/${name}/${version}?fields=files`))
          file = files.filter(f => f.endsWith('.js'))[0]
          console.warn(`Loading "${file}" for "${name}@${version}". Consider specifying a file.`)
        }
        return fetch(`https://cdnjs.cloudflare.com/ajax/libs/${name}/${version}/${file}`)
      } else  {
        console.warn(`Loading latest version of "${name}". Consider specifying a version and a file.`)
        const { latest } = JSON.parse(fetch(`https://api.cdnjs.com/libraries/${name}/?fields=latest`))
        return fetch(latest)
      }
    }
  }

  class Source extends AbstractSource {
    constructor({ name, url }={}) {
      if (!url)
        throw new Error(`A URL is required to download a library.`)
      if (!url.startsWith('https'))
        throw new Error(`Only HTTPS protocol is supported.`)

      super(name)
      this.url = url
    }

    getSource() {
      return fetch(this.url)
    }
  }

  // TODO Polyfill Source from a GAS polyfill project

  return { setup, install, Cdnjs, Source }
})())
