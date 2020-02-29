/** This module defines the DataSource class, which represents 
 *  data, which hasn't been yet loaded into a buffer.
 */
const File = require('./file');
const Data = require('./data');


class DataSource {
  /** Constructs the data source from a file and optional offset and length.
   *
   * @param {File} sourceFile a File where the data should be read from
   * @param {number} offset the offset, where the data starts (default: 0)
   * @param {number} size the length of the data block (default: sourceFile.size-offset)
   */
  constructor(sourceFile, offset, size) {
    if (!(sourceFile instanceof File)) {
      throw new Error("source must be a File");
    }

    this.source = sourceFile;
    this.offset = offset || 0;
    this.size   = size; // Cannot use || here as 0 might be a valid length
    if (this.size === undefined) {
      this.size = this.source.size - this.offset;
    }
  }
  /** Converts the DataSource into a Data object. This works asynchronously, as it
   *  has to read the content from the file
   *
   * @return {Promise<Data>}
   */
  async toData() {
    const buffer = await this.source.readSlice(this.offset, this.size);
    return new Data(buffer);
  }
  
  toString () {
    return "DataSource:[offset:" + this.offset + ",size:" + this.size + "]@File";
  }
}

// Export class
module.exports = DataSource
