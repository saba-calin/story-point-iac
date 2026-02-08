export async function handler(event: any) {
  try {
    console.log(event);

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "OK"
      })
    };
  } catch (error) {

    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "Internal server error"
      })
    }
  }
}
