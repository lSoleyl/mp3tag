//A simple console logging module module


//Default settings, change via output.settings().debug = true
var config = {
  debug:false,
  info:true,
  error:true
}


var output = function(txt) {
  console.log(txt)
}

output.config = function() { return config }

output.error =  function(msg) {
  if (config.error)
    console.error("[ERROR] " + msg)
}

output.info = function(msg) {
  if (config.info)
    console.log("[INFO] " + msg)
}

output.debug = function(msg) {
  if (config.debug)
  console.log("[DEBUG] " + msg)
}

module.exports = output
