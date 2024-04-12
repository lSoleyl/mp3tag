/** This module defines the data class. This class represents
 *  data, which has been loaded into a buffer.
 */

import { File, Writer } from "./file";


export class Data {
  private offset: number;
  private size: number;

  /** Constructor for Data object
   *
   * @param source a Buffer containing the data
   * @param offset the offset where the data starts (default 0)
   * @param size the length of the data (default buffer.length - offset)
   */
  constructor(private source: Buffer, offset?:number, size?:number) {
    this.offset = offset ?? 0;
    this.size = size ?? (source.length - this.offset);
  }

  /** Write the data into a file at the file's current position. 
   *  The whole buffer is simply written into the given file
   *  (while respecting offset and size). 
   *
   * @param writer either a File opened in write mode or a writer of type:
   *               (buffer, offset, length) => Promise<number>
   * 
   * @return {Promise<number>} resolves to the total number of bytes written to file
   */
  writeInto(writer: File|Writer) {
    const write = (writer instanceof File) ? writer.bufferWriter() : writer;
    return write(this.source, this.offset, this.size);
  }

  /** Returns the buffer, which the data holds.
   *  If offset == 0 and size == buffer.length, then the whole underlying buffer is returned.
   *  Otherwise a slice of it is returned.
   *  
   * @return the buffer, represented by this data object.                            
   */
  toBuffer() {
    if (this.offset == 0 && this.size == this.source.length) {
      return this.source;
    }
    
    return this.source.subarray(this.offset, this.size);
  }

  toString() {
    return "Data:[offset:" + this.offset + ",size:" + this.size + "]@Buffer";
  }

  inspect() {
    return this.toString();
  }
}

