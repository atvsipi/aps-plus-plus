let fs = require('fs'),
    path = require('path'),
    {$} = require('bun'),
    ffi = require('bun:ffi'),
    cfg = require('../config.js');

const _exports = [];

console.log(`Loading ffi modules...`);

const compilePath = path.join(__dirname, '../ffi/compiled');

async function processFfiFolder(directory) {
    let folder = fs.readdirSync(directory);
    for (let filename of folder) {
        let filepath = directory + `/${filename}`;
        let isDirectory = fs.statSync(filepath).isDirectory();
        if (isDirectory) {
            await processFfiFolder(filepath);

            continue;
        }

        if (!filename.endsWith('.d.js')) continue;

        console.log(`Loading ffi module: ${filename}`);
        let wrapper = require(filepath);
        if (typeof wrapper === 'function') {
            const _wrapper = wrapper(ffi);

            wrapper = _wrapper;
        }

        const ffiFile = directory + '/' + wrapper.file;

        try {
            fs.statSync(ffiFile);

            if (cfg.COMPILE) {
                await $`gcc -shared -o ${compilePath + '/' + wrapper.file}.so -fPIC ${ffiFile}`;
            }

            const {symbols} = ffi.dlopen(compilePath + '/' + wrapper.file + '.so', wrapper.types);

            if (wrapper.wrapper) {
                const externs = wrapper.wrapper(symbols);

                for (const key in externs) {
                    _exports[key] = externs[key];
                }
            }
        } catch (err) {
            console.error('[ERROR] ' + err);
        }
    }
}

let ffiModulesLoadStart = performance.now();

await processFfiFolder(path.join(__dirname, '../ffi'));

let ffiModulesLoadEnd = performance.now();

console.log('Loaded ffi modules in ' + util.rounder(ffiModulesLoadEnd - ffiModulesLoadStart, 3) + ' milliseconds. \n');

export default _exports;
