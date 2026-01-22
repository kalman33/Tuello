export interface HttpReturn {
  key: string;
  response: any;
  httpCode: any;
  headers?: Record<string, string>;
}
