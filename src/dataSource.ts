/** This module defines the DataSource class, which represents 
 *  data, which hasn't been yet loaded into a buffer.
 */

import { Data } from './data';
import { File } from './file';

export class DataSource {
  private source: File;
  private offset: number;
  private size: number;

  /** Constructs the data source from a file and optional offset and length.
   *
   * @param sourceFile a File where the data should be read from
   * @param offset the offset, where the data starts (default: 0)
   * @param size the length of the data block (default: sourceFile.size-offset)
   */
  constructor(sourceFile: File, offset?: number, size?: number) {
    if (!(sourceFile instanceof File)) {
      throw new Error("source must be a File");
    }

    this.source = sourceFile;
    this.offset = offset ?? 0;
    this.size = size ?? (this.source.size - this.offset);
  }

  /** Converts the DataSource into a Data object. This works asynchronously, as it
   *  has to read the content from the file
   */
  async toData() {
    const buffer = await this.source.readSlice(this.offset, this.size);
    return new Data(buffer);
  }
  
  toString () {
    return "DataSource:[offset:" + this.offset + ",size:" + this.size + "]@File";
  }
}
