'use strict';

const spawn = require('child_process').spawn;
const fs = require('fs');
const path = require('path');
const async = require('async');
const rimraf = require('rimraf');
const grunt = require('grunt');
const moment = require('moment');


class Builder {
    constructor(src, dst, cfg) {
        this._src = path.resolve(src);

        if (!fs.existsSync(this._src)) {
            console.error('Src directory does not exist.');
            return;
        }

        if (!dst) {
            console.error('Please provide a destination.');
            return;
        }

        if (fs.existsSync(this._src + '/.buildrc')) {
            try {
                this._config = JSON.parse(fs.readFileSync(this._src + '/.buildrc'));
            } catch (e) {
                console.error('.buildrc is not a valid JSON file.');
            }
        } else console.warn('Missing .buildrc file. Default config is used!');

        this._config = this._config || {};
        if (cfg) this._config = this._config[cfg] || {};
        this._config['commands'] = this._config['commands'] || {};

        this._cwd       = path.resolve(this._src, this._config['cwd'] || '');
        this._dest       = path.resolve(dst);
        this._files = this._config['files'] || [];

        this._commands = [];
        this._commands['pre']  = this._config['commands']['pre'] || [];
        this._commands['post'] = this._config['commands']['post'] || [];
    }

    build(callback) {
        if (!this._dest) return;

        grunt.task.init = function() {};

        const cfg = {
            src: this._src,
            dest: this._dest,

            gitinfo: {
                options: {
                    cwd: this._src
                },
            },

            rimraf: {
                default: {
                    path: this._dest
                }
            },

            copy: {
                default: {
                    files: [
                        {expand: true, cwd: this._cwd, src: this._files, dest: this._dest}
                    ]
                },
            },

            commands_pre: {
                default: this._commands.pre
            },

            commands_post: {
                default: this._commands.post
            }
        };

        let t1 = __dirname + '/../node_modules/grunt-gitinfo/tasks';
        let t2 = __dirname + '/../node_modules/grunt-contrib-copy/tasks';
        if (!fs.existsSync(t1)) t1 = __dirname + '/../../grunt-gitinfo/tasks';
        if (!fs.existsSync(t2)) t2 = __dirname + '/../../grunt-contrib-copy/tasks';

        grunt.loadTasks(t1);
        grunt.loadTasks(t2);
        grunt.initConfig(cfg);

        grunt.registerTask('commands_pre', 'Pre-build commands', function() {
            let done = this.async();
            let src = grunt.config.get('src').replace(/\\/g, '/');
            let commands = grunt.config.get('commands_pre.default');

            async.series(commands.map(cmd => callback => {
                grunt.log.writeln('Executing: ' + 'cd ' + src + ' && ' + cmd);

                process.chdir(src);
                console.log('CWD:', process.cwd());

                let p = exec('cd ' + src + ' && ' + cmd, callback);
                p.stdout.on('data', data => console.log(data.toString('utf8')));
                p.stderr.on('data', data => console.warn(data.toString('utf8')));
            }), error => {
                if (error) grunt.fail.fatal(error);
                else grunt.log.writeln('Pre-build commands executed.');

                done();
            });
        });

        grunt.registerTask('commands_post', 'Pre-build commands', function() {
            let done = this.async();
            let dest = grunt.config.get('dest').replace(/\\/g, '/');
            let commands = grunt.config.get('commands_post.default');

            async.series(commands.map(cmd => callback => {
                grunt.log.writeln('Executing: ' + 'cd ' + dest + ' && ' + cmd);

                process.chdir(dest);
                console.log('CWD:', process.cwd());

                let p = exec('cd ' + dest + ' && ' + cmd, callback);
                p.stdout.on('data', data => console.log(data.toString('utf8')));
                p.stderr.on('data', data => console.warn(data.toString('utf8')));
            }), error => {
                if (error) grunt.fail.fatal(error);
                else grunt.log.writeln('Post-build commands executed.');

                done();
            });
        });

        grunt.registerTask('rimraf', 'Remove old destination dir', function() {
            let done = this.async();
            let dest = grunt.config.get('rimraf.default.path').replace(/\\/g, '/');

            rimraf(dest, error => {
                if (error) grunt.fail.fatal(error);
                else grunt.log.writeln('Removed ' + dest + '.');

                done();
            });
        });

        grunt.registerTask('buildinfo', 'Build info', function() {
            let dest = grunt.config.get('dest').replace(/\\/g, '/');
            let commit = grunt.config.get('gitinfo.local.branch.current.lastCommitNumber');
            let name = grunt.config.get('gitinfo.local.branch.current.name');
            let hash = grunt.config.get('gitinfo.local.branch.current.shortSHA');

            grunt.log.writeln('Writing build info to .buildinfo');

            let d = moment().utc().format('YYYY-MM-DD, hh:mm:ss');
            let info = 'Build time: ' + d + '\n';
            if (commit && name && hash) info += 'Git info: #' + commit + ' ' + name + ' ' + hash + '\n';

            grunt.file.write(dest + '/.buildinfo', info);
        });

        grunt.registerTask('default', ['rimraf', 'gitinfo', 'commands_pre', 'copy', 'commands_post', 'buildinfo']);

        grunt.tasks(['default'], undefined, callback);
    }
}


function exec(cmd, callback) {
    let bash = spawn('bash');
    
    let stdout = '';
    let stderr = '';
    let error = null;

    bash.stdout.on('data', (data) => stdout += data);
    bash.stderr.on('data', (data) => stderr += data);
    bash.on('error', e => error = e);
    bash.on('close', code => callback(error || stderr || null, stdout, stderr));
    
    bash.stdin.write(cmd + '\n');
    bash.stdin.end();
    
    return bash;
}

function run(path, commands, callback) {
    async.series(commands.map(cmd => callback => {
        let process = exec('cd ' + path + ' && ' + cmd, callback);
        process.stdout.on('data', data => console.log(data.toString('utf8')));
        process.stderr.on('data', data => console.warn(data.toString('utf8')));
    }), callback);
}

function sync(dirSrc, dirDst, whitelist, blacklist, callback) {
    async.series(
        whitelist.map(item => cb => {
            let process = exec('cd ' + __dirname + ' && npm run sync ' + path.resolve(dirSrc, item) + ' ' + path.resolve(dirDst, item), error => {
                if (error) console.error('Copying ERROR: ' + path.resolve(dirSrc, item));
                else console.log('Copying done: ' + path.resolve(dirSrc, item));

                cb(error);
            });
            // process.stdout.on('data', data => console.log(data));
            // process.stderr.on('data', data => console.warn(data));
        }),

        error => {
            if (error) console.error('Error copying whitelist.');
            else console.log('Copied whitelist.');

            if (error) return callback(error);

            async.parallel(
                blacklist.map(item => callback => {
                    rimraf(path.resolve(dirDst, item), error => {
                        if (error) console.error('Removing ERROR: ' + path.resolve(dirSrc, item));
                        else console.log('Removing done: ' + path.resolve(dirSrc, item));
                        callback(error);
                    });
                }),

                error => {
                    if (error) console.error('Error removing blacklist.');
                    else console.log('Removed blacklist.');

                    callback(error);
                }
            );
        }
    );
}


module.exports = Builder;