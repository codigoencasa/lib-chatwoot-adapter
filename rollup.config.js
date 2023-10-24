const commonjs = require('@rollup/plugin-commonjs')
const { default: json } = require('@rollup/plugin-json')
const { nodeResolve } = require('@rollup/plugin-node-resolve')
const { join } = require('path')

const PATH = join(__dirname, 'lib', 'chatwoot.cjs')

module.exports = {
    input: join(__dirname, 'src','index.js'),
    output: {
        file: PATH,
        format: 'cjs',
    },
    plugins: [
        commonjs(),
        json(),
        nodeResolve(),
    ],
}