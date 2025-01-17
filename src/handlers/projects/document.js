import * as fs from 'node:fs/promises'
import * as fsPath from 'node:path'

import hljs from 'highlight.js/lib/core'
import javascript from 'highlight.js/lib/languages/javascript'
import naturalSort from 'natural-sort'

import { getFiles } from './_lib/get-files'
import { getPackageData } from './_lib/get-package-data'

hljs.registerLanguage('javascript', javascript)

const help = {
  name        : 'Local project document',
  summary     : 'Generates developer documents for local projects.',
  description : 'Generates developer documentation for <em>local<rst> projects which have been imported to the liq playground.'
}

const method = 'put'
const paths = [
  ['projects', ':orgKey', ':localProjectName', 'document'],
  ['orgs', ':orgKey', 'projects', ':localProjectName', 'document']
]
const parameters = [
  {
    name        : 'ignoreDocumentationImplementation',
    isBoolean   : true,
    description : 'If set to true, then a missing <code>implementation:documentation<rst> label will not cause the process to exit.'
  }
]

const func = ({ app, model }) => async(req, res) => {
  const { orgKey, ignoreDocumentationImplementation, localProjectName } = req.vars

  const requireImplements = ignoreDocumentationImplementation === true
    ? []
    : ['implements:documentation']

  const pkgData = await getPackageData({ orgKey, localProjectName, requireImplements })
  // else, we are good to start generating documentation!

  const { projectFQN, projectPath } = pkgData

  const pkgSrc = fsPath.join(projectPath, 'src')
  const docPath = fsPath.join(projectPath, 'docs')

  const pkgSrcLength = pkgSrc.length
  const sourceFiles = await getFiles({ dir : pkgSrc, reName : '.(?:js|mjs)$' })
  const dirs = {}

  await fs.rm(docPath, { recursive : true })

  const tocFiles = []

  await Promise.all(sourceFiles.map(async(file) => {
    const fileContents = await fs.readFile(file, { encoding : 'utf8' })
    const pkgRelPath = file.slice(pkgSrcLength)
    const pkgRelDoc = pkgRelPath + '.html' // so we end up with file names like 'library.js.html'
    const docFilePath = fsPath.join(docPath, pkgRelDoc)
    const docDirPath = fsPath.dirname(docFilePath)

    tocFiles.push(pkgRelDoc)

    if (dirs[docDirPath] === undefined) {
      await fs.mkdir(docDirPath, { recursive : true })
      dirs[docDirPath] = true
    }

    const htmlifiedSource = htmlifySource(fileContents, pkgRelPath)

    return fs.writeFile(docFilePath, htmlifiedSource)
  }))

  tocFiles.sort(naturalSort)

  const indexPath = fsPath.join(docPath, 'index.html')
  let tocContent = `<html>
  <head>
    <title>${projectFQN}</title>
  </head>
    <body>
      <ul>`
  for (const tocFile of tocFiles) {
    tocContent += `
        <li>
          <a href=${tocFile}>${tocFile.slice(0, -5)}</a>
        </li>`
  }
  tocContent += `
      </ul>
    </body>
  </html>`

  await fs.writeFile(indexPath, tocContent)

  res.setHeader('content-type', 'text/terminal').send(`Documented ${sourceFiles.length} source files.`)
}

const extToType = {
  js  : 'javascript',
  jsx : 'javascript',
  mjs : 'javascript'
}

const htmlifySource = (rawContent, pkgRelPath) => {
  const fileExt = pkgRelPath.slice(pkgRelPath.lastIndexOf('.') + 1)
  const fileType = extToType[fileExt] || fileExt
  const title = fsPath.basename(pkgRelPath)

  const html = `<html>
  <head>
    <title>${title}</title>

    <style>
      body {
        width: 100%;
        text-align: center;
      }

      pre {
        text-align: left;
        display: inline-block;
        max-width: 120em;
        margin: 1em 1em;
        padding: 1em 1em;
        border-top: solid blue 1px;
        border-right: solid blue 1px;
        border-bottom: solid blue 1px;
      }
    </style>

    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.7.0/styles/base16/google-light.min.css">
  </head>
  <body>
    <pre><code>
${hljs.highlight(rawContent, { language : fileType }).value}
    </code></pre>
  </body>
</html>`

  return html
}

export { func, help, method, parameters, paths }
