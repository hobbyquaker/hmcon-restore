var fs = require('fs');
var path = require('path');
var mkdir = require('mkdirp').sync;
var exec = require('child_process').exec;
var spawn = require('child_process').spawn;
var config = require('./config.js');

if (!fs.existsSync(config.file)) {
    console.log('Error: ' + config.file + ' not found');
    process.exit(1);
}

var hmconDir = path.join(__dirname, '../..');
var backupDir = path.join(hmconDir, 'tmp', 'ccu2backup');
var restoreDir = path.join(hmconDir, 'tmp', 'restore');

mkdir(backupDir);

var configDir = path.join(backupDir, 'usr/local/etc/config');

var cmd = 'tar -xzf ' + config.file + ' -C ' + backupDir;

exec(cmd, function (error, stdout, stderr) {
    if (!error) {
        console.log('unzipped', config.file);
        var version = fs.readFileSync(path.join(backupDir, 'firmware_version')).toString();
        console.log('Backup was created with firmware', version.replace('VERSION=', 'version ').replace('\n', ''));
        var key_index = parseInt(fs.readFileSync(path.join(backupDir, 'key_index')).toString().replace('\n', ''), 10);
        if (key_index === 0) {
            console.log('No individual AES key is set');
        } else {
            console.log('Individual AES key is used');
        }

        //var ids = fs.readFileSync(path.join(configDir, 'ids')).toString();
        //console.log(ids);

        var usr_local = path.join(backupDir, 'usr_local.tar.gz');
        cmd = 'tar -xzf ' + usr_local + ' -C ' + backupDir;
        exec(cmd, function (error) {


            if (!error) {
                console.log('unzipped usr_local.tar.gz');

                restore();
                parseRegadom();
                apply();

            } else {
                console.log('Error: ' + error);
            }
        });


    } else {
        console.log('Error: ' + error);
    }


});


function parseRegadom(cb) {
    var parser = new require('xml2js').Parser({
        explicitArray: true,
        explicitChildren: true,
        mergeAttrs: true
    });

    console.log('parsing homematic.regadom');
    parser.parseString(fs.readFileSync(path.join(configDir, 'homematic.regadom')).toString(), function (err, res) {
        var channels = res.dom.objmap[0].channelmap[0].channel;
        var devices = res.dom.objmap[0].devicemap[0].device;
        var enums = res.dom.objmap[0].enummap[0].enum;
        var names = {};
        var rooms = {};
        var funcs = {};
        var regadom = {};
        console.log('creating address-name mapping for', devices.length, 'devices and', channels.length, 'channels');
        channels.forEach(function (channel) {
            var meta = channel.obj[0].metadata[0].value[0];
            var address = meta.match(/ADDRESS:"([^"]+)"/)[1];
            names[address] = channel.obj[0].name[0];
            regadom[channel.obj[0].id[0]] = {name: channel.obj[0].name[0], address: address};
        });

        devices.forEach(function (device) {
            var meta = device.obj[0].metadata[0].value[1];
            var address = meta.match(/ADDRESS:"([^"]+)"/)[1];
            //console.log(device.obj[0].name[0], meta);
            names[address] = device.obj[0].name[0];
            regadom[device.obj[0].id[0]] = {name: device.obj[0].name[0], address: address};

        });

        mkdir(path.join(restoreDir, 'var/hm-manager'));
        fs.writeFileSync(path.join(restoreDir, 'var/hm-manager/names.json'), JSON.stringify(names, null, '  '));

        var enumIds = [];
        enums.forEach(function (en) {
            //console.log(en.obj[0].id[0], en.obj[0].name[0], en.enel[0].oid);
            regadom[en.obj[0].id[0]] = {name: en.obj[0].name[0], children: en.enel[0].oid}
            enumIds.push(en.obj[0].id[0]);
        });

        regadom[101].children.forEach(function (room) {
            var tmp = [];
            regadom[room].children.forEach(function (channel) {
                tmp.push({name: regadom[channel].name, address: regadom[channel].address});
            });
            rooms[regadom[room].name] = tmp;
        });
        fs.writeFileSync(path.join(restoreDir, 'var/hm-manager/rooms.json'), JSON.stringify(rooms, null, '  '));

        regadom[151].children.forEach(function (func) {
            var tmp = [];
            regadom[func].children.forEach(function (channel) {
                tmp.push({name: regadom[channel].name, address: regadom[channel].address});
            });
            funcs[regadom[func].name] = tmp;
        });
        fs.writeFileSync(path.join(restoreDir, 'var/hm-manager/funcs.json'), JSON.stringify(funcs, null, '  '));

    });
}

function apply() {
    // Todo stop daemons
    // Todo copy files
    // Todo start daemons
}

function restore() {
    var cp;

    function cplog() {
        cp.stdout.on('data', function (buf) {
            console.log(buf.toString());
        });
        cp.stderr.on('data', function (buf) {
            throw new Error(buf.toString());
        });
    }

    console.log('restoring rfd devices...');
    mkdir(path.join(restoreDir, 'var/rfd/devices'));
    cp = spawn('cp', ['-R', path.join(configDir, 'rfd/'), path.join(restoreDir, 'var/rfd/devices')]);
    cplog();
    console.log('restoring rfd.conf to rfd.conf.ccu');
    mkdir(path.join(restoreDir, 'etc/rfd'));
    cp = spawn('cp', [path.join(configDir, 'rfd.conf'), path.join(restoreDir, 'etc/rfd.conf.ccu')]);
    cplog();

    console.log('restoring rfd keys');
    cp = spawn('cp', [path.join(configDir, 'keys'), path.join(restoreDir, 'var/rfd/')]);
    cplog();

    console.log('restoring rfd ids');
    cp = spawn('cp', [path.join(configDir, 'ids'), path.join(restoreDir, 'etc/rfd/')]);
    cplog();

    console.log('restoring hs485d devices...');
    mkdir(path.join(restoreDir, 'var/hs485d/devices'));
    cp = spawn('cp', ['-R', path.join(configDir, 'hs485d/'), path.join(restoreDir, 'var/hs485d/devices')]);
    cplog();

    console.log('restoring hs485d.conf to hs485d.conf.ccu');
    cp = spawn('cp', [path.join(configDir, 'hs485d.conf'), path.join(restoreDir, 'etc/hs485d.conf.ccu')]);
    cplog();

}