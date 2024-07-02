export class LogManager {
    private static isEnabled: boolean = true;
    private static readonly prefix: string = '[ TUELLO ] ';


    public static enable(): void {
        LogManager.isEnabled = true;
    }

    public static disable(): void {
        LogManager.isEnabled = false;
    }

    public static log(...args: any[]): void {
        if (LogManager.isEnabled) {
            console.log(LogManager.prefix, ...args);
        }
    }
}