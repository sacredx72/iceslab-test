// Minimal ambient types for qrcode-svg (no @types package fetched to avoid a
// second registry round-trip; only the surface we use is declared).
declare module 'qrcode-svg' {
  interface QRCodeOptions {
    content: string;
    padding?: number;
    width?: number;
    height?: number;
    color?: string;
    background?: string;
    ecl?: 'L' | 'M' | 'Q' | 'H';
    join?: boolean;
    container?: string;
  }
  export default class QRCode {
    constructor(options: QRCodeOptions | string);
    svg(): string;
  }
}
