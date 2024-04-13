/** This module exports the interpolator class, which can be used to interpolate 
 *  parameter strings based on the source filename and tag data, which is useful when
 *  trying to automatically rename a file based on it's tag data or vice versa.
 */

import * as _ from 'lodash';
import { TagData } from '../tagdata';

//TODO: Add more interpolation functionality, like var navigation

// Map of varname -> interpolation function(itp) -> promise[string]
const variables = {
  /** Retrieves the interpolator's source file.
   * 
   * @param interpolator the interpolator instance to get the source from
   * 
   * @return a promise, which resolves to the interpolator's source file
   */
  'source': async function(interpolator: Interpolator)  {
    return interpolator.source;
  }
};

// Lets use $ for now.. I know this isn't optimal for linux though...
const varPrefix = '$';
const varPostfix = '';

type VariableCache = Partial<Record<keyof typeof variables, string>>;

export class Interpolator {
  /** the file, from which the tagdata has been parsed
   */
  public source: string; 

  /** cached variable values to only calculate them once
   */
  private varCache: VariableCache = {};

  /** Should be called by the --in task if it receives a file as parameter
   * 
   * @param ourceFile the file, from which the tagdata has been parsed
   * @param tagData the parsed tagdata
   */
  constructor(sourceFile: string, private tagData: TagData) {
    this.source = sourceFile;
  }

  /** Should be called to interpolate the given string and replace all variables in it
   * 
   * @param rawString the string to replace the variables in 
   *
   * @return a promise, which resolves to the interpolated string
   */
  async interpolate(rawString: string) {
    let result = rawString;

    if (!result) {
      return Promise.resolve(result);
    }

    // Preload all referenced variables
    await this.loadVariables(rawString);

    // Replace all occurring variables
    let varName: keyof typeof variables;
    for (varName in variables) {
      const fullVarName = varPrefix + varName + varPostfix;
      result = result.replace(fullVarName, this.varCache[varName]!); // now that all variables are preloaded, we can assume that none is undefined
    }

    return result;
  }

  /** Loads all occuring variables into varcache
   *  
   * @param rawString the string to load the variables for
   * 
   * @return a promise, which resolves when all variables are loaded
   *         into the variable cache. The resolved value are the variable values.
   *         The promise gets rejected if one of the interpolation functions fails
   */
  loadVariables(rawString: string) {
    const variablePromises: Promise<string>[] = [];

    let varName: keyof typeof variables;
    for (varName in variables) {
      const interpolateFn = variables[varName];
      const fullVarName = varPrefix + varName + varPostfix;
      if (rawString.indexOf(fullVarName) !== -1) {
        if (!this.varCache[varName]) {
          variablePromises.push(interpolateFn(this).then((value) => { 
            this.varCache[varName] = value;
            return Promise.resolve(value);
          }));
        }
      }
    }
      
    return Promise.all(variablePromises);
  }
}
