var argv = require('minimist')(process.argv.slice(2))

var tag = require('./mp3tag')

//TODO do something with command line args...
//console.dir(argv)

var path = argv["file"]

if (!path) {
  console.error("Please provide an input file with --file")
  return
}

tag.readHeader(path, function(err, res) { console.dir(err || res) })

