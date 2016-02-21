#!/usr/bin/env node

function exit( err ) {
  if (err) {
    console.log(err.message || err);
    process.exit(1);
  }

  console.log(chalk.bold.cyan('FIN'));
};

process.on('uncaughtException', exit);

process.chdir(__dirname);

var Deferred = require('deferred-stream'),
  ProgressBar = require('progress'),
  ArcStream = require('arcstream'),
  inquirer = require('inquirer'),
  progress = require('progress'),
  through = require('through2'),
  config = require('config'),
  mkdirp = require('mkdirp'),
  chalk = require('chalk'),
  async = require('async'),
  path = require('path'),
  util = require('util'),
  FTP = require('ftp'),
  url = require('url'),
  fs = require('fs');

var client = new FTP();

function askQuestion( question, cb ) {
  inquirer.prompt([
    question
  ], function( data ) {
    cb(null, data);
  })
};

function promptDialog( cb ) {
  async.waterfall([
    function( cb ) {
      var uri = url.parse(config.uri, true, true),
        auth = uri.auth && uri.auth.split(':') || [];

      client.on('ready', cb);

      client.connect({
        host: uri.hostname,
        user: auth[0],
        password: auth[1],
        port: uri.port || 21
      });
    },
    function( cb ) {
      client.cwd(config.remote.dir, cb);
    },
    function( ack, cb ) {
      client.list(cb);
    },
    function( listing, cb ) {
      var choices = listing.sort(function( a, b ) {
        return b.date - a.date;
      }).map(function( entry ) {
        return {
          name: entry.name,
          value: entry,
          checked: false
        }
      });

      askQuestion({
        type: 'checkbox',
        name: 'paths',
        message: 'Select items to download:',
        choices: choices
      }, cb);
    },
    function( selection, cb ) {
      var paths = selection.paths;

      async.eachSeries(paths, downloadRecursive, cb);
    }
  ], cb);
}

var outputColor = chalk.magenta;

function getFile( stats ) {
  return Deferred(function( writeable ) {
    client.get(stats.name, function( err, stream ) {
      if (err) {
        return writeable.emit('error', err);
      }

      console.log(path.basename(stats.name));

      var bar = new ProgressBar(outputColor("\t Downloading: [:bar] :percent :etas"), {
        width: 20,
        total: stats.size
      });

      stream.pipe(through(function( chunk, enc, cb ) {
        bar.fmt = outputColor("\t Downloading: [:bar] :percent :etas")
        bar.tick(chunk.length);
        cb(null, chunk);
      })).pipe(writeable);
    });
  });
}

function writeFile( filepath, stream, cb ) {
  var localPath = path.resolve(config.local.dir, filepath);

  mkdirp(path.dirname(localPath), function( err ) {
    if (err) {
      return cb(err);
    }

    stream.pipe(fs.createWriteStream(localPath));
    stream.on('error', cb);
    stream.on('end', cb);

  });
}

function downloadRecursive( stats, cb ) {
  if (stats.type === 'd') {
    client.list(stats.name, function( err, listing ) {
      if (err) {
        return cb(err);
      }

      listing.sort(function( a, b ) {
        var aExt = path.extname(a.name),
          bExt = path.extname(b.name);

        if (aExt === bExt) {
          return a.name.localeCompare(b.name, 'kn');
        }

        if (path.basename(a, aExt) === path.basename(b, bExt)) {
          if (aExt === '.sfv') {
            return -1;
          }

          if (bExt === '.sfv') {
            return 1;
          }

          if (aExt === '.nfo') {
            return -1;
          }

          if (bExt === '.nfo') {
            return 1;
          }

          if (aExt === '.rar' && ~bExt.indexOf('.r')) {
            return -1;
          }

          if (bExt === '.rar' && ~aExt.indexOf('.r')) {
            return 1;
          }
        }

        return a.name.localeCompare(b.name, 'kn');
      });

      for (var i = 0; i < listing.length; i++) {
        listing[i].name = path.join(stats.name, listing[i].name);
      }

      var buckets = listing.reduce(function( memo, stats ) {
        var extname = path.extname(stats.name),
          basename = path.basename(stats.name, extname);

        if (extname === '.rar' && /\.part\d+$/i.test(basename)) {
          basename = path.basename(basename, path.extname(basename));
        }

        if (/^\.(rar|r\d+)$/i.test(extname)) {

          var key = basename + '.rar';

          if (!memo.hasOwnProperty(key)) {
            memo[key] = [];
          }

          memo[key].push(stats);
        } else {
          memo[stats.name] = stats;
        }

        return memo;
      }, {});

      buckets = Object.keys(buckets).map(function( key ) {
        return buckets[key];
      });

      async.eachSeries(buckets, function( bucket, cb ) {
        if (Array.isArray(bucket)) {
          var archive = new ArcStream();

          bucket.forEach(function( stats, i ) {
            archive.addFile(i, getFile(stats));
          });

          archive.on('file', function( filename, stream, arcFile ) {
            var filepath = path.join(stats.name, filename);

            outputColor = chalk.cyan;

            console.log(chalk.cyan('Streaming:', filepath));

            writeFile(filepath, stream, function( err ) {
              console.log.apply(console, arguments);
            });
          });

          archive.on('done', cb);
        } else {
          downloadRecursive(bucket, cb);
        }
      }, cb);
    });
  } else {
    writeFile(stats.name, getFile(stats), cb);
  }
}

promptDialog(exit);