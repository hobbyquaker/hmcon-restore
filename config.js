var pkg = require('./package.json');
var config = require('yargs')
    .usage(pkg.name + ' ' + pkg.version + '\n' + pkg.description + '\n\nUsage: $0 [options]')
    .describe('f', 'path to ccu2 backup file')
    .alias({
        'f': 'file',
        'v': 'version',
        'h': 'help'
    })
    .demand('file')
    .version()
    .help('help')
    .argv;

module.exports = config;