import { handler } from "../lambda/ws-connect/index";

describe("ws-connect", () => {
  it("returns 200 on connect", async () => {
    const event = { requestContext: { connectionId: "conn1" } };
    const result = await handler(event);
    expect(result.statusCode).toBe(200);
  });
});
