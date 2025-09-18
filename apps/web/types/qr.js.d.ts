declare module 'qr.js' {
  interface QROptions {
    typeNumber?: number;
    errorCorrectionLevel?: string;
  }

  class QRCode {
    constructor(typeNumber: number, errorCorrectionLevel: string);
    addData(data: string): void;
    make(): void;
    getModuleCount(): number;
    isDark(row: number, col: number): boolean;
  }

  export = QRCode;
}