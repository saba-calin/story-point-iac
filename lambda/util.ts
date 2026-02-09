export default function generateErrorResponse(statusCode: number, message: string) {
  return {
    statusCode: statusCode,
    body: JSON.stringify({
      message: message
    })
  };
}
