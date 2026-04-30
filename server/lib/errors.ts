export function createServerError(statusCode: number, statusMessage: string) {
  return Object.assign(new Error(statusMessage), {
    statusCode,
    statusMessage
  })
}
