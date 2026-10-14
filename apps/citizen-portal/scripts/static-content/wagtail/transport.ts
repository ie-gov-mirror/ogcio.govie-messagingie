export type Query = Record<string, string | number>

export type TransportResponse = {
  status: number
  body: unknown
}

export type Transport = {
  get(path: string, query?: Query): Promise<TransportResponse>
}
