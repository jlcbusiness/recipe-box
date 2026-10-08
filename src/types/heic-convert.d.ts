declare module 'heic-convert' {
  type ConversionOptions = {
    buffer: Uint8Array;
    format: 'JPEG' | 'PNG';
    quality?: number;
  };

  function convert(options: ConversionOptions): Promise<Uint8Array>;

  export default convert;
}
