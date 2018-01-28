#!/usr/bin/env node
'use strict';

const fs = require('fs');
const program = require('commander');

const pkg = fs.readFileSync(__dirname + '/../package.json');

program
    .version(JSON.parse(pkg).version)
    .usage('[options] [src] <dest>')
    .parse(process.argv);

let src = program.args[0];
let dest = program.args[1];
let config = (program.args[2] || '').trim();

if (!dest) {
    dest = src;
    src = process.cwd();
}

const Builder = require('../src/Builder');

let builder = new Builder(src, dest, config);

builder.build(() => console.log('\nSUCCESS!'));
