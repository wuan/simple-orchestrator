export interface HttpRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
}

export interface HttpResponse {
  status: number;
  /** Header names lower-cased. */
  headers: Record<string, string>;
  text: string;
}

export interface HttpClient {
  request(input: HttpRequest): Promise<HttpResponse>;
}

/** Default HTTP client backed by the global `fetch`. */
export class FetchHttpClient implements HttpClient {
  async request(input: HttpRequest): Promise<HttpResponse> {
    const response = await fetch(input.url, {
      method: input.method,
      headers: input.headers,
      body: input.body,
    });
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });
    const text = await response.text();
    return { status: response.status, headers, text };
  }
}
