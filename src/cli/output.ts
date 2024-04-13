// A simple console logging module module


// Default settings, change via output.config().debug = true
const enabled = {
  debug:false,
  info:true,
  error:true
};


export function config() {
  return enabled;
}

export function error(msg:any) {
  if (enabled.error) {
    console.error("[ERROR] " + msg);
  }
}
  
export function info(msg: any) {
  if (enabled.info) {
    console.log("[INFO] " + msg);
  }
}

export function debug(msg: any) {
  if (enabled.debug) {
    console.log("[DEBUG] " + msg);
  }
}
