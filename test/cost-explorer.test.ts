const mockCostExplorerSend = jest.fn();

jest.mock("@aws-sdk/client-cost-explorer", () => ({
  CostExplorerClient: jest.fn().mockImplementation(() => ({ send: mockCostExplorerSend })),
  GetCostAndUsageCommand: jest.fn().mockImplementation((input) => input),
  GetCostAndUsageCommandInput: {},
  GroupDefinitionType: { DIMENSION: "DIMENSION" }
}));

import { handler } from "../lambda/cost-explorer/index";

describe("cost-explorer", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 200 with cost data", async () => {
    mockCostExplorerSend.mockResolvedValueOnce({
      ResultsByTime: [
        {
          TimePeriod: { Start: "2024-01-01" },
          Groups: [
            {
              Keys: ["Amazon DynamoDB"],
              Metrics: { UnblendedCost: { Amount: "1.50", Unit: "USD" } }
            },
            {
              Keys: ["AWS Lambda"],
              Metrics: { UnblendedCost: { Amount: "0.75", Unit: "USD" } }
            }
          ]
        }
      ]
    });

    const event = {};
    const result = await handler(event);
    expect(result.statusCode).toBe(200);

    const body = JSON.parse(result.body);
    expect(body).toHaveLength(2);
    expect(body[0]).toEqual({
      period: "2024-01-01",
      service: "Amazon DynamoDB",
      cost: "1.50",
      unit: "USD"
    });
    expect(body[1]).toEqual({
      period: "2024-01-01",
      service: "AWS Lambda",
      cost: "0.75",
      unit: "USD"
    });
  });

  it("returns empty array when no results", async () => {
    mockCostExplorerSend.mockResolvedValueOnce({ ResultsByTime: [] });
    const result = await handler({});
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual([]);
  });

  it("handles missing fields gracefully", async () => {
    mockCostExplorerSend.mockResolvedValueOnce({
      ResultsByTime: [
        {
          TimePeriod: null,
          Groups: [{ Keys: null, Metrics: null }]
        }
      ]
    });

    const result = await handler({});
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body[0].period).toBe("");
    expect(body[0].service).toBe("");
  });

  it("returns 500 on unexpected error", async () => {
    mockCostExplorerSend.mockRejectedValueOnce(new Error("AWS error"));
    const result = await handler({});
    expect(result.statusCode).toBe(500);
  });
});
