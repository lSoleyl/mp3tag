/** This module exports the interpolator class, which can be used to interpolate 
 *  parameter strings based on the source filename and tag data, which is useful when
 *  trying to automatically rename a file based on it's tag data or vice versa.
 */

const _ = require('lodash');

//TODO: Add more interpolation functionality, like var navigation

// Map of varname -> interpolation function(itp) -> promise[string]
const variables = {
  /** Retrieves the interpolator's source file.
   * 
   * @param {Interpolator} interpolator the interpolator instance to get the source from
   * 
   * @return {Promise<string>} resolves to the interpolator's source file
   */
  'source': async function(interpolator)  {
    return interpolator.source;
  }
};

// Lets use $ for now.. I know this isn't optimal for linux though...
const varPrefix = '$';
const varPostfix = '';


class Interpolator {
  /** Should be called by the --in task if it receives a file as parameter
   * 
   * @param {string} sourceFile the file, from which the tagdata has been parsed
   * @param {TagData} tagData the parsed tagdata
   */
  constructor(sourceFile, tagData) {
    this.source = sourceFile;
    this.tagData = tagData;
    this.varCache = {}; // cached variable values to only calculate them once
  }

  /** Should be called to interpolate the given string and replace all variables in it
   * 
   * @param {string} rawString the string to replace the variables in 
   *
   * @return {Promise<string>} resolves to the interpolated string
   */
  async interpolate(rawString) {
    let result = rawString;

    if (!result) {
      return Promise.resolve(result);
    }

    // Preload all referenced variables
    await this.loadVariables(rawString);

    // Replace all occurring variables
    _.each(variables, (ifn, varName) => {
      const fullVarName = varPrefix + varName + varPostfix;
      result = result.replace(fullVarName, this.varCache[varName]);
    });

    return result;
  }

  /** Loads all occuring variables into varcache
   *  
   * @param {string} rawString the string to load the variables for
   * 
   * @return {Promise<string[]>} a promise, which resolves when all variables are loaded
   *         into the variable cache. The resolved value are the variable values.
   *         The promise gets rejected if one of the interpolation functions fails
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
