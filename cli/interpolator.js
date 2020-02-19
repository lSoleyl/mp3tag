/** This module exports the interpolator class, which can be used to interpolate parameter strings
 */

const _ = require('lodash');

//Map of varname -> interpolation function(itp) -> promise[string]
const variables = {
  'source':function(itp)  {
    return Promise.resolve(itp.source);
  }
};

//Lets use $ for now.. I know this isn't optimal for linux though...
const varPrefix = '$';
const varPostfix = '';


class Interpolator {
  /** Should be called by the --in task if it receives 
   *  a file as parameter
   */
  constructor(sourceFile, tagData) {
    this.source = sourceFile;
    this.tagData = tagData;
    this.varCache = {}; // cached variable values to only calculate them once
  }

  /** Should be called to interpolate the given string and replace all variables in it
   * 
   * @param rawString the string to replace the variables in 
   *
   * @return a promise, which resolves to the interpolated string
   */
  interpolate(rawString) {
    let result = rawString;

    if (!result) {
      return Promise.resolve(result);
    }

    return this.loadVariables(rawString).then(() => {
      //All variables are loaded

      _.each(variables, (ifn, varName) => {
        const fullVarName = varPrefix + varName + varPostfix;
        result = result.replace(fullVarName, this.varCache[varName]);
      });

      return Promise.resolve(result);
    });
  }

  /** Loads all occuring variables into varcache
   *  
   * @return a promise, which resolves when all variables are loaded into the cache
   *         the promise gets rejected if one of the interpolation functions fails
   */
  loadVariables(rawString) {
    const variablePromises = [];
    _.each(variables, (interpolateFn, varName) => {
      const fullVarName = varPrefix + varName + varPostfix;
      if (rawString.indexOf(fullVarName) !== -1) {
        if (!this.varCache[varName]) {
          variablePromises.push(interpolateFn(this).then((value) => { 
            this.varCache[varName] = value;
            return Promise.resolve(value);
          }));
        }
      }
    });

    return Promise.all(variablePromises);
  }
}

module.exports = Interpolator;
