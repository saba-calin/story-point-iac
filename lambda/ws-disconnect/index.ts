export async function handler(event: any) {
  try {
    console.log(event);
    console.log("disconnecting...");

    return {
      statusCode: 200
    }

  } catch (error: any) {
    console.error(error);
    return {
      statusCode: 500
    }
  }
}
