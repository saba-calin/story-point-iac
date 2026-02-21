export async function handler(event: any) {
  try {
    console.log("Event: ", event);

    return {
      statusCode: 200
    };

  } catch (error: any) {
    console.error(error);
    return {
      statusCode: 500
    };
  }
}
